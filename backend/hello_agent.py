"""Phase 1 check: confirm a deepagents agent runs.

Needs GROQ_API_KEY (or GOOGLE_API_KEY with LLM_PROVIDER=gemini) in backend/.env.
Run: python hello_agent.py   (from backend/)
"""
from deepagents import create_deep_agent

from llm import model_id

print(f"Using {model_id()}")

agent = create_deep_agent(
    model=model_id(),
    tools=[],
    system_prompt=(
        "You are a citizen living in the United States on October 22, 1962. "
        "You know only what was public that evening. Answer in two sentences."
    ),
)

result = agent.invoke({"messages": [{"role": "user", "content": "Are we going to war?"}]})
print(result["messages"][-1].content)
