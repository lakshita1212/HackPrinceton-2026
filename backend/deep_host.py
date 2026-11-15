"""The host rebuilt with LangChain deepagents: a planner, one subagent per role,
and a checker subagent.

Turned on with HOST=deepagents in .env. The time lock does not depend on the
model behaving:
  - Each role's search tool is bound in code to that role and the station's
    day, so no prompt can make it return a later or out-of-role fact.
  - A citizen, journalist or official gets only their own subagent; only the
    historian may consult the others ("compare perspectives").
  - The final answer is accepted only if the checker passed that exact text
    with sources that were actually retrieved. Anything else raises, and
    host.ask falls back to the simple host.
"""
import logging
from datetime import date

from deepagents import (
    GeneralPurposeSubagentProfile,
    HarnessProfile,
    create_deep_agent,
    register_harness_profile,
)
from langchain.agents.structured_output import ToolStrategy
from pydantic import BaseModel, Field

import host
from langchain.chat_models import init_chat_model

from llm import model_id
from packs import Fact, load_pack
from retrieval import search, visible_facts

log = logging.getLogger("deep_host")

# Groq's free tier allows 8,000 tokens a minute, and every deepagents call
# carries the prompts of its built-in tools. Our agents only need their search
# and check tools, so drop the file, shell and to-do tools and the
# general-purpose subagent.
register_harness_profile(
    "groq",
    HarnessProfile(
        excluded_tools=frozenset(
            {"ls", "read_file", "write_file", "edit_file", "delete", "glob", "grep", "execute", "write_todos"}
        ),
        general_purpose_subagent=GeneralPurposeSubagentProfile(enabled=False),
    ),
)


class FinalAnswer(BaseModel):
    answer: str = Field(description="The checked answer, exactly as approved by the checker.")
    source_ids: list[str] = Field(description="The fact ids the checker approved.")


class Unverified(Exception):
    pass


def _role_prompt(role: str, day: date) -> str:
    when = "today, with full hindsight" if role == "historian" else f"on {day:%B} {day.day}, {day.year}"
    return (
        f"You are {host.PERSONAS[role]}\n"
        f"You are speaking {when}.\n"
        f"Always call search_{role}_sources first, then answer using ONLY what it returns. "
        "Never add names, numbers, events or quotes that aren't in the results, and only quote "
        "words given as a verbatim quote. If the results don't cover the question, say you "
        "haven't heard anything about that. Speak in first person, 2 to 4 short sentences.\n"
        "Reply in exactly this format:\nANSWER: <what you say>\nSOURCES: <comma-separated fact ids you used>"
    )


def build(question: str, role: str, day: date, pack: str):
    """Build a per-request agent. Returns (agent, state) where state records what was retrieved and verified."""
    retrieved: dict[str, Fact] = {}
    verified: dict[str, list[str]] = {}  # approved answer text -> its source ids

    def make_search(r: str):
        def search_sources(query: str) -> str:
            facts = search(pack, r, day, query, k=6)
            for f in facts:
                retrieved[f.id] = f
            return host._facts_block(facts) or "No sources found."
        search_sources.__name__ = f"search_{r}_sources"
        search_sources.__doc__ = (
            f"Search the sources a {r} could know"
            + ("" if r == "historian" else f" on or before {day.isoformat()}")
            + ". Returns facts with their ids."
        )
        return search_sources

    def check_answer(answer: str, source_ids: list[str]) -> str:
        """Verify a draft answer against the facts it cites. Returns APPROVED or the problems to fix."""
        used = [retrieved[i] for i in dict.fromkeys(source_ids) if i in retrieved]
        if not used:
            return "REJECTED: cite at least one fact id returned by a search tool."
        verdict = host._check(answer, role, day, used)
        if verdict.ok:
            verified[answer.strip()] = [f.id for f in used]
            return "APPROVED"
        return "REJECTED: " + "; ".join(verdict.problems or ["unsupported claims"])

    # The historian may compare what each role knew; everyone else only knows their own room.
    roles = ["citizen", "journalist", "official", "historian"] if role == "historian" else [role]
    subagents = [
        {
            "name": r,
            "description": (
                f"The {r}"
                + ("" if r == "historian" else f", as of {day:%B} {day.day}, {day.year}")
                + ". Give them the caller's question; they answer in character with fact ids."
            ),
            "system_prompt": _role_prompt(r, day),
            "tools": [make_search(r)],
        }
        for r in roles
    ]
    subagents.append({
        "name": "checker",
        "description": "Strict fact checker. Give it the draft answer and its fact ids; it returns APPROVED or the problems.",
        "system_prompt": (
            "You verify draft answers. Call check_answer with the exact draft text and its fact ids, "
            "then report its result word for word."
        ),
        "tools": [check_answer],
    })

    compare = (
        "If the caller asks how people saw things differently, also ask the citizen, journalist and "
        "official subagents what they knew, and have the historian's answer compare them. "
        if role == "historian" else ""
    )
    planner_prompt = (
        "You run the switchboard of a radio station that connects callers to people in history.\n"
        f"This caller is connected to the {role}. Steps:\n"
        f"1. Send the caller's question to the {role} subagent with the task tool. {compare}\n"
        "2. Send that draft answer and its fact ids to the checker subagent.\n"
        f"3. If the checker rejects it, send the {role} subagent the question again with the problems to fix, "
        "then check the new draft. Do this at most once.\n"
        "4. Return the approved answer word for word, with its fact ids. Never write or edit the answer yourself."
    )

    agent = create_deep_agent(
        # Qwen on Groq also caps output at 1,000 tokens a minute, so keep each step short.
        model=init_chat_model(model_id("agent"), temperature=0.2, max_retries=2, max_tokens=600),
        tools=[],
        system_prompt=planner_prompt,
        subagents=subagents,
        response_format=ToolStrategy(FinalAnswer),
    )
    return agent, {"retrieved": retrieved, "verified": verified}


def ask(question: str, role: str, day: date, pack: str) -> dict:
    if host.asks_about_future(question, role, day, pack):
        return host._blocked("future")
    if not visible_facts(load_pack(pack), role, day):
        return host._blocked("unsupported")

    agent, state = build(question, role, day, pack)
    result = agent.invoke(
        {"messages": [{"role": "user", "content": question}]},
        config={"recursion_limit": 40},
    )
    final: FinalAnswer | None = result.get("structured_response")
    if final is None:
        raise Unverified("no structured answer")

    # Code-level gate: only an answer the checker approved, with retrieved sources.
    approved_ids = state["verified"].get(final.answer.strip())
    if approved_ids is None:
        raise Unverified("final answer was not the approved text")
    used = [state["retrieved"][i] for i in approved_ids]
    return {
        "answer": final.answer.strip(),
        "sources": [f.as_source() for f in used],
        "blocked": False,
        "blocked_reason": None,
    }
