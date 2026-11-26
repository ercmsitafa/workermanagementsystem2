# Advanced Collaboration Hub — Implementation Plan

## Purpose
Add a secure, integrated collaboration workspace to Worker Management System 2. This is incremental: existing workforce features, authentication, data, and APIs must remain working.

## Scope
1. **Workspaces & teams** — department/project teams, membership, owner, visibility, team settings.
2. **Channels** — team channels, public/private membership, topic/description, announcements.
3. **Messaging** — direct and group messaging, history, replies/threading, reactions, edits/deletes with audit metadata, attachments, search.
4. **Task collaboration** — tasks linked to teams/channels, assignees, priority, due dates, status, labels, comments, attachments, and activity history.
5. **Project boards** — configurable columns and Kanban view (To Do, In Progress, Review, Done).
6. **Mentions & notifications** — @user and @team mentions, unread counts, in-app notifications, preferences.
7. **Shared resources** — files and links shared in a workspace, with access checks and safe upload validation.
8. **Calendar & events** — team events, meeting details, deadlines, and RSVP (later phase).
9. **Presence** — online/away/busy/offline indicators (later phase; advisory only).
10. **Activity feed** — workspace/team events, task changes, and message-related activity.

## UX / Navigation
Add a Collaboration section in the app navigation:
- Overview
- My Tasks
- Projects / Boards
- Teams
- Channels
- Messages
- Calendar
- Shared Files
- Activity

Use responsive layouts, accessible controls, loading/empty/error states, pagination, search, and notification badges. Keep the design consistent with the existing UI and do not replace the current dashboard.

## Suggested data model
Create migrations before adding tables. Use the existing database adapter during the first implementation stage; do not switch databases or overwrite data as part of this feature.

- collaboration_teams: id, name, description, department_id (nullable), created_by, visibility, created_at, updated_at
- collaboration_team_members: id, team_id, user_id, membership_role, joined_at; unique(team_id,user_id)
- collaboration_channels: id, team_id, name, description, channel_type, created_by, created_at; unique(team_id,name)
- collaboration_channel_members: id, channel_id, user_id, joined_at; unique(channel_id,user_id) (required for private channels)
- collaboration_conversations: id, conversation_type, created_by, created_at
- collaboration_conversation_members: id, conversation_id, user_id, joined_at; unique(conversation_id,user_id)
- collaboration_messages: id, channel_id (nullable), conversation_id (nullable), sender_id, body, parent_message_id (nullable), edited_at, deleted_at, created_at; require exactly one channel or conversation context
- collaboration_message_reactions: id, message_id, user_id, reaction, created_at; unique(message_id,user_id,reaction)
- collaboration_tasks: id, team_id, channel_id (nullable), title, description, status, priority, due_date, created_by, created_at, updated_at, completed_at
- collaboration_task_assignees: id, task_id, user_id; unique(task_id,user_id)
- collaboration_task_comments: id, task_id, user_id, body, created_at, updated_at
- collaboration_task_labels: id, team_id, name, color; unique(team_id,name)
- collaboration_task_label_links: task_id, label_id; unique(task_id,label_id)
- collaboration_files: id, uploader_id, team_id (nullable), channel_id (nullable), task_id (nullable), storage_key, original_name, mime_type, size_bytes, created_at
- collaboration_events: id, team_id, title, description, start_at, end_at, created_by, created_at
- collaboration_event_attendees: id, event_id, user_id, response_status; unique(event_id,user_id)
- collaboration_activity: id, actor_id, team_id, entity_type, entity_id, action, metadata_json, created_at
- collaboration_read_cursors: id, user_id, channel_id (nullable), conversation_id (nullable), last_read_message_id, updated_at
- collaboration_notification_preferences: user_id, event_type, enabled; unique(user_id,event_type)

All tables should have foreign keys, indexes for frequent queries, timestamps, and appropriate cascade/restrict behavior. Never store secrets or sensitive employee/payroll details in collaboration messages or logs. Add migrations and tests.

## API design (initial REST)
Use existing API conventions first; plan future /api/v1 versioning separately.

- Teams: GET/POST /api/collaboration/teams, GET/PUT/DELETE /api/collaboration/teams/:teamId, membership endpoints
- Channels: GET/POST /api/collaboration/teams/:teamId/channels, channel details, membership endpoints
- Messages: GET/POST /api/collaboration/channels/:channelId/messages, GET/POST /api/collaboration/conversations/:conversationId/messages, edit/delete, replies, reactions, search
- Direct conversations: create/find conversation, list user's conversations
- Tasks: list/create/update/delete, assignees, comments, labels, board columns
- Files: upload/list/download/delete (permission checks on every operation)
- Events: list/create/update/delete, RSVP
- Notifications: list, mark read, preferences
- Activity: feed with filters and pagination

Use consistent responses, request validation, pagination, and centralized error handling.

## Authorization rules
- Authentication is required for all collaboration APIs.
- Team membership is required for team-private content.
- Private-channel membership is required to view or post in a private channel.
- Direct messages are visible only to conversation members.
- Task visibility inherits team/channel visibility; assignment must not bypass team access.
- Only team owners/managers or authorized HR/admin roles may change team membership/settings.
- Enforce access on the backend for every read, write, file download, and search result. Frontend hiding is UX only.
- HR/admin permissions do not automatically expose private messages; explicit documented policy is required.
- Validate mention targets and notify only users permitted to see the content.

## Realtime and security
- Add Socket.IO later, after REST authorization is established.
- Authenticate socket connections; authorize each room join; derive room membership server-side; never trust client-supplied room names.
- Use HTTPS in production; validate and sanitize message content; protect against XSS; rate-limit message and upload endpoints.
- Validate upload size, MIME type and file signature; store files outside public web root or in private object storage; use authorization-checked download endpoints.
- Use parameterized SQL, transactions for multi-step writes, and audit sensitive actions.
- Prevent unauthorized user enumeration in direct-message/member search.
- Avoid logging message contents, tokens, or private file data.
- Keep notification and activity records scoped to recipient/team permissions.

## Delivery phases
### Phase A — foundation
- Inspect existing frontend integration and database setup.
- Add migration and collaboration schema.
- Add backend modules, validation, permission helpers, and tests.
- Establish API docs and sample requests.

### Phase B — teams & channels
- Team creation, membership, department linking, channel creation, private channel membership.
- Build team/channel UI and navigation.

### Phase C — messaging
- REST messages, direct/group conversations, threads, reactions, unread/read state, search.
- Secure file attachments.
- Add realtime events only after REST is tested.

### Phase D — tasks & boards
- Task CRUD, assignments, comments, labels, due dates, Kanban boards, activity history.

### Phase E — notifications, calendar & feed
- Mentions, in-app notifications, user preferences, events/calendar, activity feed.

### Phase F — hardening
- Authorization tests, abuse/rate-limit tests, upload security tests, accessibility, responsive testing, API documentation, backup considerations.

## Definition of done
- Every feature is connected to backend/database (no fake-only controls).
- Every API checks authentication and object-level authorization.
- Migrations are reversible/safe and do not delete existing data.
- Tests cover authorized and unauthorized access, validation, and core workflows.
- UI has loading, empty, error, and success states and works on mobile.
- README documents setup, migrations, test commands, and limitations.
- Work is committed on feature/advanced-collaboration-hub; do not merge to main without review.

## Existing-system compatibility notes
The repository currently has an Express backend and authentication roles documented as admin, hr, and worker. Collaboration should initially reuse authenticated-user identity and role checks, while adding explicit team/channel permissions. Do not assume the master blueprint's PostgreSQL/Prisma stack is already installed; assess current database and frontend structure before deciding on migrations.
