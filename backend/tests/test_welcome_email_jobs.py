from services.welcome_email_jobs import (
    WELCOME_EMAIL_JOB_TYPE,
    build_welcome_email_activation_key,
    enqueue_welcome_email_after_activation,
)


class Response:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    def __init__(self, db, table):
        self.db = db
        self.table = table
        self.filters = []
        self.insert_row = None
        self.update_row = None
        self.limit_count = None

    def select(self, *_args):
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def in_(self, column, values):
        self.filters.append((column, set(values)))
        return self

    def limit(self, count):
        self.limit_count = count
        return self

    def maybe_single(self):
        return self

    def insert(self, row):
        self.insert_row = row
        return self

    def update(self, row):
        self.update_row = row
        return self

    def execute(self):
        if self.insert_row is not None:
            row = {"id": f"job-{len(self.db.background_jobs) + 1}", **self.insert_row}
            self.db.background_jobs.append(row)
            return Response([row])

        if self.update_row is not None:
            rows = [
                row
                for row in self.db.background_jobs
                if all(self._matches(row, column, value) for column, value in self.filters)
            ]
            for row in rows:
                row.update(self.update_row)
            return Response(rows)

        if self.table == "users":
            row = self.db.users.get(self._filter_value("id"))
            return Response(row)

        if self.table == "background_jobs":
            rows = [
                row
                for row in self.db.background_jobs
                if all(self._matches(row, column, value) for column, value in self.filters)
            ]
            if self.limit_count is not None:
                rows = rows[: self.limit_count]
            return Response(rows)

        return Response([])

    def _filter_value(self, column):
        for filter_column, value in self.filters:
            if filter_column == column:
                return value
        return None

    @staticmethod
    def _matches(row, column, value):
        if column.startswith("payload->>"):
            payload_key = column.split("payload->>", 1)[1]
            return row.get("payload", {}).get(payload_key) == value

        actual = row.get(column)
        if isinstance(value, set):
            return actual in value
        return actual == value


class FakeDb:
    def __init__(self):
        self.background_jobs = []
        self.users = {}

    def table(self, name):
        return FakeQuery(self, name)


def test_builds_stable_user_product_activation_key():
    assert (
        build_welcome_email_activation_key("user-1", "Shop")
        == "welcome_email:shop:user-1"
    )


def test_enqueues_welcome_email_after_activation():
    db = FakeDb()

    result = enqueue_welcome_email_after_activation(
        db,
        user_id="user-1",
        product="shop",
        activation_event="trial_started",
        activation_id="trial-1",
        email="owner@example.com",
        full_name="Owner",
    )

    assert result["enqueued"] is True
    assert len(db.background_jobs) == 1
    job = db.background_jobs[0]
    assert job["type"] == WELCOME_EMAIL_JOB_TYPE
    assert job["payload"]["activation_key"] == "welcome_email:shop:user-1"
    assert job["payload"]["activation_event"] == "trial_started"


def test_does_not_enqueue_duplicate_welcome_email_for_same_user_product():
    db = FakeDb()

    kwargs = {
        "user_id": "user-1",
        "product": "shop",
        "activation_event": "paid_subscription_activated",
        "activation_id": "sub-1",
        "email": "owner@example.com",
        "full_name": "Owner",
    }

    first = enqueue_welcome_email_after_activation(db, **kwargs)
    second = enqueue_welcome_email_after_activation(db, **kwargs)

    assert first["enqueued"] is True
    assert second["skipped"] is True
    assert second["reason"] == "already_exists"
    assert len(db.background_jobs) == 1


def test_immediate_send_marks_job_completed(monkeypatch):
    db = FakeDb()
    sent_payloads = []

    def fake_send(payload):
        sent_payloads.append(payload)
        return {"sent": True, "provider_response": {"id": "email-1"}}

    monkeypatch.setattr(
        "services.welcome_email_jobs.send_welcome_email_from_payload",
        fake_send,
    )

    result = enqueue_welcome_email_after_activation(
        db,
        user_id="user-1",
        product="shop",
        activation_event="trial_started",
        activation_id="trial-1",
        email="owner@example.com",
        full_name="Owner",
        send_immediately=True,
    )

    assert result["enqueued"] is True
    assert result["sent"] is True
    assert sent_payloads[0]["activation_key"] == "welcome_email:shop:user-1"
    assert db.background_jobs[0]["status"] == "completed"


def test_existing_pending_job_is_sent_immediately(monkeypatch):
    db = FakeDb()
    db.background_jobs.append(
        {
            "id": "job-existing",
            "type": WELCOME_EMAIL_JOB_TYPE,
            "status": "pending",
            "attempts": 0,
            "max_attempts": 3,
            "payload": {
                "email": "owner@example.com",
                "full_name": "Owner",
                "product": "shop",
                "activation_event": "trial_started",
                "activation_id": "trial-1",
                "activation_key": "welcome_email:shop:user-1",
            },
        }
    )

    monkeypatch.setattr(
        "services.welcome_email_jobs.send_welcome_email_from_payload",
        lambda payload: {"sent": True, "provider_response": {"id": "email-1"}},
    )

    result = enqueue_welcome_email_after_activation(
        db,
        user_id="user-1",
        product="shop",
        activation_event="trial_started",
        activation_id="trial-1",
        email="owner@example.com",
        full_name="Owner",
        send_immediately=True,
    )

    assert result["reason"] == "already_exists"
    assert result["sent"] is True
    assert len(db.background_jobs) == 1
    assert db.background_jobs[0]["status"] == "completed"
