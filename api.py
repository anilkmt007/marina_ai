import frappe
import json
import requests
from frappe import _
from datetime import datetime


# ─── Helpers ────────────────────────────────────────────────────────────────

def _get_ai_config():
    """Read AI config from Marina AI Settings doctype (or Site Config fallback)."""
    try:
        settings = frappe.get_single("Marina AI Settings")
        return {
            "provider":    settings.ai_provider or "openai",
            "api_key":     settings.get_password("api_key") or "",
            "model":       settings.model or "gpt-4o-mini",
            "system_prompt": settings.system_prompt or _default_system_prompt(),
            "base_url":    settings.base_url or "",
        }
    except Exception:
        # Fallback to frappe site config keys
        return {
            "provider":    frappe.conf.get("marina_ai_provider", "openai"),
            "api_key":     frappe.conf.get("marina_ai_api_key", ""),
            "model":       frappe.conf.get("marina_ai_model", "gpt-4o-mini"),
            "system_prompt": _default_system_prompt(),
            "base_url":    frappe.conf.get("marina_ai_base_url", ""),
        }


def _default_system_prompt():
    company = frappe.defaults.get_global_default("company") or "your company"
    return (
        f"You are Chanakya AI, an intelligent ERP assistant for {company}. "
        "You help users with ERPNext tasks: creating documents, analyzing data, "
        "finding records, explaining workflows, and answering business questions. "
        "Be concise, helpful, and professional. When asked to create or find "
        "documents, provide actionable guidance with exact menu paths."
    )


def _call_openai(messages, config):
    """Call OpenAI-compatible API."""
    base_url = config["base_url"] or "https://api.openai.com/v1"
    resp = requests.post(
        f"{base_url}/chat/completions",
        headers={
            "Authorization": f"Bearer {config['api_key']}",
            "Content-Type": "application/json",
        },
        json={
            "model": config["model"],
            "messages": messages,
            "max_tokens": 1024,
            "temperature": 0.7,
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"]


def _call_anthropic(messages, config):
    """Call Anthropic Claude API."""
    system = messages[0]["content"] if messages and messages[0]["role"] == "system" else ""
    user_msgs = [m for m in messages if m["role"] != "system"]
    resp = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": config["api_key"],
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        json={
            "model": config["model"] or "claude-3-haiku-20240307",
            "max_tokens": 1024,
            "system": system,
            "messages": user_msgs,
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["content"][0]["text"]


def _call_ai(messages, config):
    provider = config["provider"].lower()
    if provider == "anthropic":
        return _call_anthropic(messages, config)
    else:
        return _call_openai(messages, config)


# ─── Session Management ──────────────────────────────────────────────────────

@frappe.whitelist()
def create_session(title=None):
    """Create a new chat session for the current user."""
    doc = frappe.get_doc({
        "doctype": "AI Chat Session",
        "user": frappe.session.user,
        "title": title or f"Chat {datetime.now().strftime('%b %d, %I:%M %p')}",
        "status": "Active",
    })
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return {"session_id": doc.name, "title": doc.title}


@frappe.whitelist()
def get_sessions(limit=20):
    """Get recent sessions for the current user."""
    sessions = frappe.db.get_list(
        "AI Chat Session",
        filters={"user": frappe.session.user},
        fields=["name", "title", "creation", "modified", "status", "message_count"],
        order_by="modified desc",
        limit=int(limit),
    )
    return sessions


@frappe.whitelist()
def rename_session(session_id, title):
    """Rename a session."""
    doc = frappe.get_doc("AI Chat Session", session_id)
    if doc.user != frappe.session.user:
        frappe.throw(_("Not authorized"))
    doc.title = title
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True}


@frappe.whitelist()
def delete_session(session_id):
    """Delete a session and all its messages."""
    doc = frappe.get_doc("AI Chat Session", session_id)
    if doc.user != frappe.session.user:
        frappe.throw(_("Not authorized"))
    frappe.db.delete("AI Chat Message", {"session": session_id})
    frappe.delete_doc("AI Chat Session", session_id, ignore_permissions=True)
    frappe.db.commit()
    return {"success": True}


@frappe.whitelist()
def clear_session_messages(session_id):
    """Clear all messages in a session but keep the session."""
    doc = frappe.get_doc("AI Chat Session", session_id)
    if doc.user != frappe.session.user:
        frappe.throw(_("Not authorized"))
    frappe.db.delete("AI Chat Message", {"session": session_id})
    doc.message_count = 0
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True}


# ─── Message History ─────────────────────────────────────────────────────────

@frappe.whitelist()
def get_messages(session_id, limit=50):
    """Get messages for a session."""
    session = frappe.get_doc("AI Chat Session", session_id)
    if session.user != frappe.session.user:
        frappe.throw(_("Not authorized"))

    messages = frappe.db.get_list(
        "AI Chat Message",
        filters={"session": session_id},
        fields=["name", "role", "content", "creation", "feedback"],
        order_by="creation asc",
        limit=int(limit),
    )
    return {"session": {"name": session.name, "title": session.title}, "messages": messages}


# ─── Chat (Main AI Call) ─────────────────────────────────────────────────────

@frappe.whitelist()
def send_message(session_id, message, context_doctype=None, context_docname=None):
    """
    Send a user message, call AI, save both messages, return AI reply.
    Works for both web widget and mobile app.
    """
    if not session_id:
        result = create_session()
        session_id = result["session_id"]

    session = frappe.get_doc("AI Chat Session", session_id)
    if session.user != frappe.session.user:
        frappe.throw(_("Not authorized"))

    config = _get_ai_config()

    # Build message history for context window (last 20 msgs)
    history = frappe.db.get_list(
        "AI Chat Message",
        filters={"session": session_id},
        fields=["role", "content"],
        order_by="creation asc",
        limit=20,
    )

    # Build messages array for AI
    ai_messages = [{"role": "system", "content": config["system_prompt"]}]

    # Add ERPNext context if provided
    if context_doctype and context_docname:
        try:
            doc = frappe.get_doc(context_doctype, context_docname)
            ctx = f"\n\nCurrent page context: {context_doctype} - {context_docname}\n"
            ctx += json.dumps(doc.as_dict(), default=str, indent=2)[:2000]
            ai_messages[0]["content"] += ctx
        except Exception:
            pass

    for h in history:
        ai_messages.append({"role": h["role"], "content": h["content"]})

    ai_messages.append({"role": "user", "content": message})

    # Save user message
    user_msg = frappe.get_doc({
        "doctype": "AI Chat Message",
        "session": session_id,
        "role": "user",
        "content": message,
    })
    user_msg.insert(ignore_permissions=True)

    # Call AI
    ai_reply = ""
    error = None
    try:
        if not config["api_key"]:
            ai_reply = (
                "⚠️ AI API key not configured. Please go to **Marina AI Settings** "
                "and add your API key to start using the AI assistant."
            )
        else:
            ai_reply = _call_ai(ai_messages, config)
    except requests.exceptions.Timeout:
        error = "timeout"
        ai_reply = "⏳ The AI took too long to respond. Please try again."
    except requests.exceptions.HTTPError as e:
        error = str(e)
        if "401" in error:
            ai_reply = "🔑 Invalid API key. Please check your Marina AI Settings."
        elif "429" in error:
            ai_reply = "🚦 Rate limit reached. Please wait a moment and try again."
        else:
            ai_reply = f"❌ AI service error: {error}"
    except Exception as e:
        error = str(e)
        ai_reply = f"❌ Unexpected error: {error}"

    # Save AI reply
    bot_msg = frappe.get_doc({
        "doctype": "AI Chat Message",
        "session": session_id,
        "role": "assistant",
        "content": ai_reply,
        "is_error": 1 if error else 0,
    })
    bot_msg.insert(ignore_permissions=True)

    # Update session message count and title (auto-title from first user message)
    session.message_count = (session.message_count or 0) + 2
    if session.message_count == 2 and len(message) > 3:
        session.title = message[:60] + ("..." if len(message) > 60 else "")
    session.save(ignore_permissions=True)
    frappe.db.commit()

    return {
        "session_id": session_id,
        "session_title": session.title,
        "user_message_id": user_msg.name,
        "bot_message_id": bot_msg.name,
        "reply": ai_reply,
        "error": error,
    }


# ─── Feedback ────────────────────────────────────────────────────────────────

@frappe.whitelist()
def submit_feedback(message_id, feedback):
    """Thumbs up/down feedback on a message. feedback: 'good' or 'bad'"""
    doc = frappe.get_doc("AI Chat Message", message_id)
    session = frappe.get_doc("AI Chat Session", doc.session)
    if session.user != frappe.session.user:
        frappe.throw(_("Not authorized"))
    doc.feedback = feedback
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return {"success": True}


# ─── Quick Actions ───────────────────────────────────────────────────────────

@frappe.whitelist()
def get_quick_stats():
    """Return quick stats for the current user's dashboard context."""
    user = frappe.session.user
    try:
        stats = {}
        # Sales invoices pending
        stats["pending_invoices"] = frappe.db.count(
            "Sales Invoice", {"status": "Unpaid", "docstatus": 1}
        )
        # Purchase orders pending
        stats["pending_po"] = frappe.db.count(
            "Purchase Order", {"status": "To Receive and Bill", "docstatus": 1}
        )
        return stats
    except Exception:
        return {}


# ─── Mobile API (token auth wrapper) ─────────────────────────────────────────

@frappe.whitelist(allow_guest=False)
def mobile_send_message(session_id, message, context_doctype=None, context_docname=None):
    """Same as send_message but explicitly for mobile — same auth via Frappe token."""
    return send_message(session_id, message, context_doctype, context_docname)


@frappe.whitelist(allow_guest=False)
def mobile_get_sessions(limit=20):
    return get_sessions(limit)


@frappe.whitelist(allow_guest=False)
def mobile_get_messages(session_id, limit=50):
    return get_messages(session_id, limit)


@frappe.whitelist(allow_guest=False)
def mobile_create_session(title=None):
    return create_session(title)
