# Marina AI — Mobile API Reference

All endpoints use standard Frappe REST API.
Base URL: `https://your-erp-domain.com`

---

## Authentication

Use Frappe token-based auth (add to every request header):

```
Authorization: token <api_key>:<api_secret>
```

Get API key/secret from: ERPNext → User → API Access → Generate Keys

---

## Endpoints

### 1. Create New Session
```
POST /api/method/marina_ai.api.mobile_create_session
Body: { "title": "Optional title" }
Response: { "session_id": "abc123", "title": "Chat Apr 27" }
```

### 2. Get All Sessions (History)
```
GET /api/method/marina_ai.api.mobile_get_sessions?limit=20
Response: [
  { "name": "abc123", "title": "Invoice query", "modified": "2024-04-27 10:30:00", "message_count": 5 },
  ...
]
```

### 3. Get Messages in Session
```
GET /api/method/marina_ai.api.mobile_get_messages?session_id=abc123&limit=50
Response: {
  "session": { "name": "abc123", "title": "Invoice query" },
  "messages": [
    { "name": "msg1", "role": "user", "content": "Hello", "creation": "...", "feedback": null },
    { "name": "msg2", "role": "assistant", "content": "Hi!", "creation": "...", "feedback": "good" },
  ]
}
```

### 4. Send Message (Main AI Call)
```
POST /api/method/marina_ai.api.mobile_send_message
Body: {
  "session_id": "abc123",        // required - get from create_session
  "message": "Show pending invoices",
  "context_doctype": "Sales Invoice",  // optional - current screen context
  "context_docname": "SINV-0001"       // optional
}
Response: {
  "session_id": "abc123",
  "session_title": "Show pending invoices",
  "user_message_id": "msgXXX",
  "bot_message_id": "msgYYY",
  "reply": "Here are your pending invoices...",
  "error": null
}
```

### 5. Submit Feedback
```
POST /api/method/marina_ai.api.submit_feedback
Body: { "message_id": "msgYYY", "feedback": "good" }  // "good" or "bad"
```

### 6. Delete Session
```
POST /api/method/marina_ai.api.delete_session
Body: { "session_id": "abc123" }
```

---

## Typical Mobile Flow

```
1. App starts → call mobile_get_sessions → show history list
2. User taps "New Chat" → call mobile_create_session → store session_id
3. User types message → call mobile_send_message with session_id → show reply
4. User scrolls up → call mobile_get_messages → show older messages
5. User long-presses message → call submit_feedback
6. User deletes chat → call delete_session
```

---

## AI Provider Setup (Admin)

Go to: ERPNext Desk → Marina AI Settings

| Field | Value |
|-------|-------|
| AI Provider | openai / anthropic / custom |
| API Key | Your OpenAI or Anthropic key |
| Model | gpt-4o-mini / claude-3-haiku-20240307 |
| Custom Base URL | For self-hosted (Ollama, LM Studio, etc.) |
| System Prompt | Leave blank for default |

### OpenAI compatible (Ollama example):
- Provider: `custom`
- Base URL: `http://localhost:11434/v1`
- API Key: `ollama` (any string)
- Model: `llama3`
