/* Marina AI Widget — Full Featured
   Sessions | History | Chat | Feedback | Mobile API compatible
*/
frappe.provide("marina_ai");

marina_ai.Widget = class {
    constructor() {
        this.isOpen       = false;
        this.sidebarOpen  = false;
        this.sessionId    = null;
        this.sessionTitle = "New Chat";
        this.sessions     = [];
        this.isLoading    = false;
        this.init();
    }

    // ── Init ─────────────────────────────────────────────────

    init() {
        frappe.after_ajax(() => {
            if (!frappe.session || frappe.session.user === "Guest") return;
            this.render();
            this.bindEvents();
            this.loadSessions();
        });
    }

    // ── Render ───────────────────────────────────────────────

    render() {
        $("#marina-ai-fab, #marina-ai-panel").remove();
        const name = (frappe.session.user_fullname || "there").split(" ")[0];
        const greeting = this._greeting();

        $("body").append(`
        <button id="marina-ai-fab" title="Chanakya AI">
            ${this._svgStar()}
        </button>

        <div id="marina-ai-panel">

            <!-- Sidebar: session history -->
            <div id="marina-sidebar">
                <div class="marina-sidebar-header">
                    <span class="marina-sidebar-title">History</span>
                    <button class="marina-new-session-btn" id="marina-new-session">+ New</button>
                </div>
                <div class="marina-sessions-list" id="marina-sessions-list">
                    <div class="marina-loading" style="padding:20px 0">
                        <div class="marina-spinner"></div>
                    </div>
                </div>
            </div>

            <!-- Main -->
            <div id="marina-main">

                <!-- Header -->
                <div class="marina-panel-header">
                    <button class="marina-history-toggle" id="marina-toggle-sidebar" title="History">
                        ${this._svgHistory()}
                    </button>
                    <div class="marina-header-center">
                        <div class="marina-status-dot"></div>
                        <div>
                            <div class="marina-header-title">Chanakya Ai Online</div>
                            <div class="marina-header-session" id="marina-session-title">New Chat</div>
                        </div>
                    </div>
                    <div class="marina-header-actions">
                        <button class="marina-icon-btn" id="marina-clear-btn" title="Clear chat">
                            ${this._svgTrash()}
                        </button>
                        <button class="marina-icon-btn" id="marina-new-chat-btn" title="New chat">
                            ${this._svgEdit()}
                        </button>
                        <button class="marina-icon-btn" id="marina-close" title="Close">
                            ${this._svgClose()}
                        </button>
                    </div>
                </div>

                <!-- Welcome screen -->
                <div id="marina-welcome">
                    <div class="marina-avatar-wrap">${this._svgStar()}</div>
                    <div class="marina-greeting">Good ${greeting}, <span class="user-name">${frappe.utils.escape_html(name)}</span></div>
                    <div class="marina-subtext">What would you like to explore today?</div>
                </div>

                <div id="marina-actions">
                    ${this._actionBtn("analyze", this._svgBar(),   "Analyze Data",  "Reports &amp; Insights")}
                    ${this._actionBtn("create",  this._svgDoc(),   "Create Docs",   "Orders, Invoices &amp; more")}
                    ${this._actionBtn("search",  this._svgSearch(),"Search",        "Find anything fast")}
                    ${this._actionBtn("learn",   this._svgHelp(),  "Learn",         "How-to &amp; guides")}
                </div>

                <!-- Chat messages -->
                <div id="marina-chat-area"></div>

                <!-- Input -->
                <div class="marina-input-area">
                    <button id="marina-add-btn" title="Attach context">${this._svgPlus()}</button>
                    <textarea id="marina-input" placeholder="Message Chanakya Ai..." rows="1"></textarea>
                    <button id="marina-send-btn">${this._svgSend()}</button>
                </div>

            </div>
        </div>`);
    }

    _actionBtn(action, icon, label, sub) {
        return `<button class="marina-action-btn" data-action="${action}">
            <div class="marina-action-icon">${icon}</div>
            <div><div class="marina-action-label">${label}</div><div class="marina-action-sub">${sub}</div></div>
        </button>`;
    }

    // ── Events ───────────────────────────────────────────────

    bindEvents() {
        const self = this;

        $(document).on("click", "#marina-ai-fab",         () => self.toggle());
        $(document).on("click", "#marina-close",          () => self.close());
        $(document).on("click", "#marina-toggle-sidebar", () => self.toggleSidebar());
        $(document).on("click", "#marina-new-session",    () => self.startNewSession());
        $(document).on("click", "#marina-new-chat-btn",   () => self.startNewSession());
        $(document).on("click", "#marina-clear-btn",      () => self.clearCurrentChat());
        $(document).on("click", ".marina-action-btn",     (e) => {
            const action = $(e.currentTarget).data("action");
            self.handleQuickAction(action);
        });
        $(document).on("click", "#marina-send-btn",       () => self.sendMessage());
        $(document).on("keydown","#marina-input",         (e) => {
            if (e.which === 13 && !e.shiftKey) { e.preventDefault(); self.sendMessage(); }
        });
        $(document).on("input", "#marina-input",          function() {
            this.style.height = "auto";
            this.style.height = Math.min(this.scrollHeight, 96) + "px";
        });

        // Session list clicks
        $(document).on("click", ".marina-session-item",   function(e) {
            if ($(e.target).hasClass("marina-session-del") || $(e.target).closest(".marina-session-del").length) return;
            self.loadSession($(this).data("id"));
        });
        $(document).on("click", ".marina-session-del", function(e) {
            e.stopPropagation();
            self.deleteSession($(this).data("id"));
        });

        // Feedback
        $(document).on("click", ".marina-feedback-btn", function() {
            const type = $(this).data("type");
            const msgId = $(this).data("id");
            self.submitFeedback(msgId, type, $(this));
        });

        // Close on outside click
        $(document).on("click.marina", (e) => {
            if (self.isOpen &&
                !$(e.target).closest("#marina-ai-panel").length &&
                !$(e.target).closest("#marina-ai-fab").length) {
                self.close();
            }
        });
    }

    // ── Panel open/close ─────────────────────────────────────

    toggle() { this.isOpen ? this.close() : this.open(); }

    open() {
        this.isOpen = true;
        $("#marina-ai-panel").addClass("open");
        $("#marina-ai-fab").addClass("panel-open");
        setTimeout(() => $("#marina-input").focus(), 300);
    }

    close() {
        this.isOpen = false;
        $("#marina-ai-panel").removeClass("open");
        $("#marina-ai-fab").removeClass("panel-open");
    }

    toggleSidebar() {
        this.sidebarOpen = !this.sidebarOpen;
        $("#marina-sidebar").toggleClass("visible", this.sidebarOpen);
    }

    // ── Sessions ─────────────────────────────────────────────

    loadSessions() {
        frappe.call({
            method: "marina_ai.api.get_sessions",
            args: { limit: 30 },
            callback: (r) => {
                this.sessions = r.message || [];
                this._renderSessionList();
            }
        });
    }

    _renderSessionList() {
        const $list = $("#marina-sessions-list");
        $list.empty();
        if (!this.sessions.length) {
            $list.html(`<div style="padding:12px 10px;color:rgba(255,255,255,.25);font-size:11px;text-align:center">No history yet</div>`);
            return;
        }
        this.sessions.forEach(s => {
            const active = s.name === this.sessionId ? " active" : "";
            const label = frappe.utils.escape_html(s.title || "Chat");
            $list.append(`
                <div class="marina-session-item${active}" data-id="${s.name}">
                    <div class="session-icon">${this._svgChat()}</div>
                    <div class="session-name">${label}</div>
                    <button class="marina-session-del" data-id="${s.name}" title="Delete">×</button>
                </div>`);
        });
    }

    async startNewSession() {
        this._showWelcome();
        this.sessionId = null;
        this.sessionTitle = "New Chat";
        $("#marina-session-title").text("New Chat");
        $(".marina-session-item").removeClass("active");
        // Close sidebar on mobile
        if (window.innerWidth < 480) { this.sidebarOpen = false; $("#marina-sidebar").removeClass("visible"); }
    }

    async loadSession(sessionId) {
        const $chat = $("#marina-chat-area");
        this.sessionId = sessionId;

        // Show loading
        $chat.addClass("active").html(`<div class="marina-loading"><div class="marina-spinner"></div></div>`);
        $("#marina-welcome, #marina-actions").hide();

        $(".marina-session-item").removeClass("active");
        $(`.marina-session-item[data-id="${sessionId}"]`).addClass("active");

        frappe.call({
            method: "marina_ai.api.get_messages",
            args: { session_id: sessionId, limit: 50 },
            callback: (r) => {
                if (!r.message) return;
                const { session, messages } = r.message;
                this.sessionId = session.name;
                this.sessionTitle = session.title;
                $("#marina-session-title").text(session.title || "Chat");

                $chat.html("");
                if (!messages.length) {
                    $chat.html(`<div style="text-align:center;color:rgba(255,255,255,.25);font-size:12px;padding:20px">No messages yet</div>`);
                    return;
                }

                let lastDate = null;
                messages.forEach(m => {
                    const d = frappe.datetime.str_to_user(m.creation, true);
                    if (d !== lastDate) {
                        $chat.append(`<div class="marina-date-divider"><span>${d}</span></div>`);
                        lastDate = d;
                    }
                    this._appendMessage(m.content, m.role === "user" ? "user" : "bot", m.name, m.feedback);
                });
                this._scrollBottom();
            }
        });

        // Close sidebar on mobile
        if (window.innerWidth < 480) { this.sidebarOpen = false; $("#marina-sidebar").removeClass("visible"); }
    }

    deleteSession(sessionId) {
        frappe.confirm("Delete this conversation?", () => {
            frappe.call({
                method: "marina_ai.api.delete_session",
                args: { session_id: sessionId },
                callback: () => {
                    if (this.sessionId === sessionId) this.startNewSession();
                    this.sessions = this.sessions.filter(s => s.name !== sessionId);
                    this._renderSessionList();
                }
            });
        });
    }

    clearCurrentChat() {
        if (!this.sessionId) return;
        frappe.confirm("Clear all messages in this chat?", () => {
            frappe.call({
                method: "marina_ai.api.clear_session_messages",
                args: { session_id: this.sessionId },
                callback: () => {
                    $("#marina-chat-area").html("");
                    frappe.show_alert({ message: "Chat cleared", indicator: "green" });
                }
            });
        });
    }

    // ── Quick actions ────────────────────────────────────────

    handleQuickAction(action) {
        const prompts = {
            analyze: "Show me a summary of pending invoices and key business metrics.",
            create:  "I want to create a new Sales Invoice. What are the steps?",
            search:  "Help me search for a specific record.",
            learn:   "Explain the most common ERPNext workflows for my role."
        };
        this._startChat(prompts[action] || action);
    }

    // ── Chat ─────────────────────────────────────────────────

    _startChat(text) {
        this._showChat();
        this._doSend(text);
    }

    sendMessage() {
        const $inp = $("#marina-input");
        const text = $inp.val().trim();
        if (!text || this.isLoading) return;
        $inp.val("").css("height", "auto");
        this._showChat();
        this._doSend(text);
    }

    async _doSend(text) {
        this.isLoading = true;
        $("#marina-send-btn").prop("disabled", true);

        this._appendMessage(text, "user");
        const $typing = this._appendTyping();
        this._scrollBottom();

        // Get current page context
        const ctx = this._getPageContext();

        frappe.call({
            method: "marina_ai.api.send_message",
            args: {
                session_id: this.sessionId || "",
                message: text,
                context_doctype: ctx.doctype,
                context_docname: ctx.docname,
            },
            callback: (r) => {
                $typing.remove();
                this.isLoading = false;
                $("#marina-send-btn").prop("disabled", false);

                if (r.message) {
                    const res = r.message;
                    // Update session id if new
                    if (!this.sessionId || this.sessionId !== res.session_id) {
                        this.sessionId = res.session_id;
                        this.sessionTitle = res.session_title;
                        $("#marina-session-title").text(res.session_title || "Chat");
                        // Refresh session list
                        this.loadSessions();
                    }
                    this._appendMessage(res.reply, "bot", res.bot_message_id);
                    this._scrollBottom();
                } else {
                    this._appendMessage("❌ Failed to get response. Please try again.", "bot error");
                    this._scrollBottom();
                }
            },
            error: () => {
                $typing.remove();
                this.isLoading = false;
                $("#marina-send-btn").prop("disabled", false);
                this._appendMessage("❌ Network error. Please check your connection.", "bot error");
                this._scrollBottom();
            }
        });
    }

    _appendMessage(content, type, msgId, existingFeedback) {
        const $chat  = $("#marina-chat-area");
        const isUser = type === "user";
        const isErr  = type.includes("error");
        const cls    = isUser ? "user" : ("bot" + (isErr ? " error" : ""));
        const time   = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        const escaped = this._formatContent(frappe.utils.escape_html(content));

        const feedbackHtml = (!isUser && msgId) ? `
            <button class="marina-feedback-btn${existingFeedback==='good'?' active good':''}" data-type="good" data-id="${msgId}" title="Good response">👍</button>
            <button class="marina-feedback-btn${existingFeedback==='bad'?' active bad':''}" data-type="bad" data-id="${msgId}" title="Bad response">👎</button>` : "";

        $chat.append(`
            <div class="marina-msg-group ${isUser ? 'user' : 'bot'}">
                <div class="marina-msg ${cls}">${escaped}</div>
                <div class="marina-msg-meta">
                    <span>${time}</span>
                    ${feedbackHtml}
                </div>
            </div>`);
    }

    _appendTyping() {
        const $chat = $("#marina-chat-area");
        const $el = $(`<div class="marina-msg-group bot">
            <div class="marina-typing"><span></span><span></span><span></span></div>
        </div>`);
        $chat.append($el);
        return $el;
    }

    _formatContent(html) {
        // Bold **text**
        html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
        // Inline code `code`
        html = html.replace(/`([^`]+)`/g, "<code style='background:rgba(255,255,255,0.12);padding:1px 5px;border-radius:4px;font-size:12px'>$1</code>");
        // Newlines
        html = html.replace(/\n/g, "<br>");
        return html;
    }

    submitFeedback(msgId, type, $btn) {
        frappe.call({
            method: "marina_ai.api.submit_feedback",
            args: { message_id: msgId, feedback: type },
            callback: () => {
                $btn.closest(".marina-msg-meta").find(".marina-feedback-btn").removeClass("active good bad");
                $btn.addClass("active " + type);
                frappe.show_alert({ message: "Thanks for your feedback!", indicator: "green" });
            }
        });
    }

    // ── Helpers ──────────────────────────────────────────────

    _showChat() {
        $("#marina-welcome, #marina-actions").hide();
        $("#marina-chat-area").addClass("active");
    }

    _showWelcome() {
        $("#marina-chat-area").removeClass("active").html("");
        $("#marina-welcome, #marina-actions").show();
    }

    _scrollBottom() {
        const $c = $("#marina-chat-area");
        $c.scrollTop($c[0]?.scrollHeight || 0);
    }

    _greeting() {
        const h = new Date().getHours();
        return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
    }

    _getPageContext() {
        try {
            const route = frappe.get_route();
            if (route && route[0] === "Form" && route[1] && route[2]) {
                return { doctype: route[1], docname: route[2] };
            }
        } catch(e) {}
        return { doctype: null, docname: null };
    }

    // ── SVG icons ────────────────────────────────────────────
    _svgStar()   { return `<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`; }
    _svgHistory(){ return `<svg viewBox="0 0 24 24"><path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7a6.97 6.97 0 0 1-4.93-2.06l-1.42 1.42A8.9 8.9 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>`; }
    _svgClose()  { return `<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`; }
    _svgTrash()  { return `<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`; }
    _svgEdit()   { return `<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`; }
    _svgBar()    { return `<svg viewBox="0 0 24 24"><path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zM16.2 13h2.8v6h-2.8v-6z"/></svg>`; }
    _svgDoc()    { return `<svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`; }
    _svgSearch() { return `<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`; }
    _svgHelp()   { return `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>`; }
    _svgPlus()   { return `<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`; }
    _svgSend()   { return `<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`; }
    _svgChat()   { return `<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`; }
};

// ── Bootstrap ────────────────────────────────────────────────

$(document).ready(function () {
    frappe.after_ajax(function () {
        if (frappe.session && frappe.session.user !== "Guest") {
            if (!marina_ai._instance) {
                marina_ai._instance = new marina_ai.Widget();
            }
        }
    });
});

// Re-init on SPA navigation
$(document).on("page-change", function () {
    if (frappe.session && frappe.session.user !== "Guest") {
        if (marina_ai._instance) {
            // Re-render if panel was removed by navigation
            if (!$("#marina-ai-fab").length) {
                marina_ai._instance.render();
                marina_ai._instance.bindEvents();
            }
        } else {
            marina_ai._instance = new marina_ai.Widget();
        }
    }
});
