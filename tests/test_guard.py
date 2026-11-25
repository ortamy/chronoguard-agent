#!/usr/bin/env python3
"""ChronoGuard guard-engine test suite. Runs inside the sprite.

    python3 /home/sprite/agent/tests/test_guard.py -v

Unit tests isolate the journal/policy files under /tmp. HTTP tests require the
service to be running on 127.0.0.1:8090.
"""

import json
import os
import shutil
import sys
import unittest
import urllib.request

sys.path.insert(0, "/home/sprite/agent")
import server as cg  # noqa: E402

TEST_DIR = "/tmp/cg_test"
REAL = {}


def setUpModule():
    os.makedirs(TEST_DIR, exist_ok=True)
    REAL.update(
        EVENTS_FILE=cg.EVENTS_FILE,
        LOG_FILE=cg.LOG_FILE,
        POLICY_FILE=cg.POLICY_FILE,
        STATE_FILE=cg.STATE_FILE,
    )
    cg.EVENTS_FILE = os.path.join(TEST_DIR, "events.jsonl")
    cg.LOG_FILE = os.path.join(TEST_DIR, "agent.log")
    cg.POLICY_FILE = os.path.join(TEST_DIR, "policies.json")
    cg.STATE_FILE = os.path.join(TEST_DIR, "state.json")
    for path in (cg.EVENTS_FILE, cg.LOG_FILE, cg.STATE_FILE):
        open(path, "w", encoding="utf-8").close()
    cg.write_policies(cg.DEFAULT_POLICY)


def tearDownModule():
    for key, value in REAL.items():
        setattr(cg, key, value)
    shutil.rmtree(TEST_DIR, ignore_errors=True)


class GuardTest(unittest.TestCase):
    def setUp(self):
        os.makedirs(cg.WORKSPACE, exist_ok=True)
        self.work = os.path.join(cg.WORKSPACE, "guard_test")
        shutil.rmtree(self.work, ignore_errors=True)
        os.makedirs(self.work, exist_ok=True)
        # keep the journal clean between tests
        open(cg.EVENTS_FILE, "w", encoding="utf-8").close()

    # -- allow path ------------------------------------------------------
    def test_safe_read_allowed(self):
        target = os.path.join(self.work, "read.txt")
        with open(target, "w", encoding="utf-8") as f:
            f.write("hello")
        result = cg.guarded_execute("read_file", {"path": target})
        self.assertTrue(result["ok"])
        self.assertEqual(result["decision"], "ALLOW")
        self.assertEqual(result["result"]["content"], "hello")

    def test_safe_write_allowed(self):
        target = os.path.join(self.work, "write.txt")
        result = cg.guarded_execute("write_file", {"path": target, "content": "data"})
        self.assertTrue(result["ok"])
        self.assertEqual(result["decision"], "ALLOW")
        self.assertTrue(os.path.isfile(target))

    def test_list_dir_allowed(self):
        result = cg.guarded_execute("list_dir", {"path": self.work})
        self.assertTrue(result["ok"])
        self.assertEqual(result["decision"], "ALLOW")

    # -- absolute blocks -------------------------------------------------
    def test_protected_write_blocked(self):
        target = os.path.join(cg.AGENT_DIR, "server.py")
        before = b""
        if os.path.isfile(target):
            with open(target, "rb") as f:
                before = f.read()
        result = cg.guarded_execute("write_file", {"path": target, "content": "# pwned\n"})
        self.assertFalse(result["ok"])
        self.assertTrue(result.get("blocked"))
        self.assertEqual(result["decision"], "BLOCK")
        if before:
            with open(target, "rb") as f:
                self.assertEqual(f.read(), before, "protected file must be untouched")

    def test_recursive_delete_protected_blocked(self):
        result = cg.guarded_execute("delete_path", {"path": cg.AGENT_DIR, "recursive": True})
        self.assertTrue(result.get("blocked"))
        self.assertEqual(result["decision"], "BLOCK")
        self.assertTrue(os.path.isdir(cg.AGENT_DIR))

    def test_delete_workspace_root_blocked(self):
        result = cg.guarded_execute("delete_path", {"path": cg.WORKSPACE, "recursive": True})
        self.assertTrue(result.get("blocked"))
        self.assertTrue(os.path.isdir(cg.WORKSPACE))

    def test_command_injection_blocked(self):
        result = cg.guarded_execute("run_command", {"command": "ls; rm -rf /home/sprite"})
        self.assertTrue(result.get("blocked"))
        self.assertEqual(result["decision"], "BLOCK")
        self.assertIn("metacharacters", " ".join(result["risk"]["reasons"]))

    def test_banned_command_blocked(self):
        result = cg.guarded_execute("run_command", {"command": "rm -rf /home/sprite/agent"})
        self.assertTrue(result.get("blocked"))
        self.assertEqual(result["decision"], "BLOCK")

    # -- deferred path ---------------------------------------------------
    def test_unknown_command_deferred(self):
        result = cg.guarded_execute("run_command", {"command": "nmap -sV 127.0.0.1"})
        self.assertTrue(result.get("pending"))
        self.assertEqual(result["decision"], "DEFER")
        self.assertEqual(result["event"]["status"], "pending")

    def test_workspace_recursive_delete_deferred(self):
        nested = os.path.join(self.work, "nested")
        os.makedirs(nested, exist_ok=True)
        result = cg.guarded_execute("delete_path", {"path": nested, "recursive": True})
        self.assertTrue(result.get("pending"))
        self.assertEqual(result["decision"], "DEFER")
        self.assertTrue(os.path.isdir(nested), "must not execute before approval")

    # -- approvals -------------------------------------------------------
    def test_approval_executes_operation(self):
        nested = os.path.join(self.work, "todelete")
        os.makedirs(nested, exist_ok=True)
        proposal = cg.guarded_execute("delete_path", {"path": nested, "recursive": True})
        event_id = proposal["event"]["id"]
        approved = cg.approve_event(event_id, actor="tester", approve=True)
        self.assertTrue(approved["ok"])
        self.assertFalse(os.path.exists(nested))
        latest = {e["id"]: e for e in cg.collapsed_events(500)}[event_id]
        self.assertEqual(latest["status"], "executed")
        self.assertEqual(latest["approval"]["state"], "approved")

    def test_explicit_denial(self):
        nested = os.path.join(self.work, "keepme")
        os.makedirs(nested, exist_ok=True)
        proposal = cg.guarded_execute("delete_path", {"path": nested, "recursive": True})
        denied = cg.approve_event(proposal["event"]["id"], actor="tester", approve=False)
        self.assertTrue(denied["denied"])
        self.assertTrue(os.path.isdir(nested), "denied operation must not run")
        latest = {e["id"]: e for e in cg.collapsed_events(500)}[proposal["event"]["id"]]
        self.assertEqual(latest["status"], "denied")

    def test_blocked_event_cannot_be_approved(self):
        result = cg.guarded_execute("write_file", {"path": os.path.join(cg.AGENT_DIR, "server.py"), "content": "x"})
        res = cg.approve_event(result["event"]["id"], approve=True)
        self.assertFalse(res["ok"])

    # -- journal ---------------------------------------------------------
    def test_event_persistence(self):
        marker = "persistence-check"
        emitted = cg.emit({"type": "test", "actor": "tester", "note": marker})
        reopened = {e["id"]: e for e in cg.collapsed_events(500)}
        self.assertIn(emitted["id"], reopened)
        self.assertEqual(reopened[emitted["id"]]["note"], marker)
        self.assertTrue(os.path.getsize(cg.EVENTS_FILE) > 0)

    # -- native checkpoints ---------------------------------------------
    def test_checkpoint_metadata(self):
        cps = cg.list_checkpoints()
        self.assertIsInstance(cps, list)
        for cp in cps:
            self.assertIn("id", cp)
            self.assertTrue(cp["id"].startswith("v") or cp["id"] == "Current")
            self.assertIn("create_time", cp)

    # -- HTTP surface ----------------------------------------------------
    def test_http_api(self):
        base = "http://127.0.0.1:8090"
        for path in ("/api/health", "/api/state", "/api/policies", "/api/snapshots"):
            with urllib.request.urlopen(base + path, timeout=10) as res:
                self.assertEqual(res.status, 200, path)
                payload = json.loads(res.read().decode("utf-8"))
                self.assertTrue(payload.get("ok"), path)

    def test_http_static_index(self):
        with urllib.request.urlopen("http://127.0.0.1:8090/", timeout=10) as res:
            self.assertEqual(res.status, 200)
            body = res.read().decode("utf-8", errors="replace")
            self.assertIn("<div id=\"root\">", body)


if __name__ == "__main__":
    unittest.main(verbosity=2)
