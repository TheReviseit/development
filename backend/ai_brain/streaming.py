"""
SSE Streaming for AI Brain v3.0.
Streams AI responses token-by-token for real-time chat experience.

Features:
- Server-Sent Events (SSE) protocol
- Human pause simulation (random 120-200ms before first token)
- Token-by-token streaming from OpenAI
- Graceful error handling with fallback to full response
"""

import json
import time
import random
import logging
from typing import Dict, Any, Generator, Optional

logger = logging.getLogger('reviseit.brain.streaming')


def human_pause():
    """
    Simulate human-like thinking pause before responding.
    Random delay between 120-200ms — feels natural, not robotic.
    """
    delay_ms = random.randint(120, 200)
    time.sleep(delay_ms / 1000.0)


def stream_ai_response(
    engine,
    message: str,
    business_data: Dict[str, Any],
    conversation_history=None,
    user_id: str = None,
    conversation_state_summary: str = "",
    user_profile: Dict[str, Any] = None,
    conversation_summary: str = None,
    is_mixed_language: bool = False,
    format_response: bool = True,
) -> Generator[str, None, None]:
    """
    Stream an AI response as SSE events.

    Yields SSE-formatted strings:
    - data: {"type": "start", "intent": "...", "confidence": 0.9}
    - data: {"type": "token", "content": "Hello"}
    - data: {"type": "done", "full_response": "...", "metadata": {...}}
    - data: {"type": "error", "message": "..."}

    Args:
        engine: ChatGPTEngine instance
        message: User's message
        business_data: Business profile
        conversation_history: Prior messages
        user_id: User identifier
        conversation_state_summary: State context
        user_profile: User memory profile
        conversation_summary: LLM-generated conversation summary
        is_mixed_language: Whether user is mixing languages
        format_response: Whether to apply WhatsApp formatting
    """
    try:
        # Step 1: Classify intent (non-streaming, fast)
        intent_result = engine.classify_intent(message, conversation_history)

        # Emit start event with intent info
        yield _sse_event({
            "type": "start",
            "intent": intent_result.intent.value,
            "confidence": round(intent_result.confidence, 2),
        })

        # Step 2: Human pause — feels natural
        human_pause()

        # Step 3: Build the prompt for generation using engine's methods
        from .prompts import build_dynamic_prompt

        complexity = engine.detect_message_complexity(message, intent_result.intent.value)

        prompt = build_dynamic_prompt(
            business_data=business_data,
            intent=intent_result.intent.value,
            user_message=message,
            language=business_data.get("_detected_language", "en"),
            is_mixed_language=is_mixed_language,
            conversation_history=conversation_history,
            conversation_state_summary=conversation_state_summary,
            user_profile=user_profile,
            conversation_summary=conversation_summary,
        )

        max_tokens = engine._get_max_tokens_for_complexity(complexity, intent_result.confidence)

        # Step 4: Stream from OpenAI
        client = engine.client

        messages = [
            {"role": "system", "content": prompt},
            {"role": "user", "content": message},
        ]

        # Add conversation history
        if conversation_history:
            history_messages = []
            for msg in conversation_history[-8:]:
                role = msg.get("role", "user")
                content = msg.get("content", "")
                if role in ("user", "assistant") and content:
                    history_messages.append({"role": role, "content": content})
            # Insert history before the current user message
            messages = [messages[0]] + history_messages + [messages[1]]

        stream = client.chat.completions.create(
            model=engine.config.llm.generation_model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=engine.config.llm.temperature,
            stream=True,
        )

        full_response = ""
        for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                token = chunk.choices[0].delta.content
                full_response += token
                yield _sse_event({
                    "type": "token",
                    "content": token,
                })

        # Step 5: Format if needed
        formatted_response = full_response
        if format_response:
            from .whatsapp_formatter import format_for_whatsapp
            formatted_response = format_for_whatsapp(full_response)

        # Step 6: Emit done event
        yield _sse_event({
            "type": "done",
            "full_response": formatted_response,
            "metadata": {
                "intent": intent_result.intent.value,
                "confidence": round(intent_result.confidence, 2),
                "complexity": complexity.value if hasattr(complexity, 'value') else str(complexity),
                "streamed": True,
            },
        })

    except Exception as e:
        logger.error(f"Streaming error: {e}")
        yield _sse_event({
            "type": "error",
            "message": "Sorry, I'm having trouble responding right now. Please try again.",
        })


def _sse_event(data: Dict[str, Any]) -> str:
    """Format data as an SSE event string."""
    return f"data: {json.dumps(data)}\n\n"
