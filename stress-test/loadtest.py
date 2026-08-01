import asyncio
import json
import random
import statistics
import string
import sys
import time
from datetime import date, timedelta

import httpx

BASE = "http://localhost"
PASSWORD = "StressTest123!"
RESULTS = []


def pct(data, p):
    if not data:
        return None
    data = sorted(data)
    k = (len(data) - 1) * p / 100
    f = int(k)
    c = min(f + 1, len(data) - 1)
    if f == c:
        return data[f]
    return data[f] + (data[c] - data[f]) * (k - f)


async def timed(client, method, url, **kw):
    t0 = time.perf_counter()
    try:
        r = await client.request(method, url, timeout=30.0, **kw)
        dt = (time.perf_counter() - t0) * 1000
        return dt, r.status_code, None, r
    except Exception as e:
        dt = (time.perf_counter() - t0) * 1000
        return dt, None, f"{type(e).__name__}: {e}", None


async def run_scenario(name, concurrency, n, make_request, client=None):
    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(base_url=BASE)
    sem = asyncio.Semaphore(concurrency)
    latencies = []
    statuses = {}
    errors = []
    extra_notes = []

    async def worker(i):
        async with sem:
            dt, status, err, resp = await make_request(client, i)
            latencies.append(dt)
            if err:
                errors.append(err)
            else:
                statuses[str(status)] = statuses.get(str(status), 0) + 1
            return resp

    t_start = time.perf_counter()
    responses = await asyncio.gather(*[worker(i) for i in range(n)])
    wall = time.perf_counter() - t_start
    if owns_client:
        await client.aclose()

    result = {
        "name": name,
        "n": n,
        "concurrency": concurrency,
        "wall_s": round(wall, 2),
        "rps": round(n / wall, 1) if wall > 0 else None,
        "p50_ms": round(pct(latencies, 50), 1),
        "p90_ms": round(pct(latencies, 90), 1),
        "p95_ms": round(pct(latencies, 95), 1),
        "p99_ms": round(pct(latencies, 99), 1),
        "max_ms": round(max(latencies), 1),
        "min_ms": round(min(latencies), 1),
        "status_counts": statuses,
        "error_count": len(errors),
        "error_sample": errors[:3],
    }
    RESULTS.append(result)
    print(f"### {name}")
    print(json.dumps(result, indent=2))
    print()
    return result, responses


async def login(client, email):
    dt, status, err, r = await timed(client, "POST", "/api/user/login/", json={"email": email, "password": PASSWORD})
    if status == 200:
        return r.json()["access"]
    raise RuntimeError(f"login failed for {email}: {status} {err} {r.text if r else ''}")


async def get_tokens(client, emails):
    tokens = await asyncio.gather(*[login(client, e) for e in emails])
    return dict(zip(emails, tokens))


def rand_suffix(n=8):
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


async def main():
    async with httpx.AsyncClient(base_url=BASE) as setup_client:
        user_emails = [f"stress_user{i}@loadtest.local" for i in range(50)]

        # ---- 1. Baseline health check ----
        await run_scenario(
            "health_check", concurrency=20, n=500,
            make_request=lambda c, i: timed(c, "GET", "/api/health/"),
        )

        # ---- 2. Public box listing (default, paginated) ----
        await run_scenario(
            "box_listing", concurrency=20, n=500,
            make_request=lambda c, i: timed(c, "GET", "/api/boxes/public/"),
        )

        # ---- 3. Filtered box listing ----
        await run_scenario(
            "box_listing_filtered", concurrency=20, n=300,
            make_request=lambda c, i: timed(c, "GET", "/api/boxes/public/", params={"sport": "Cricket", "location": "Mumbai"}),
        )

        # ---- 4. Box detail retrieve ----
        await run_scenario(
            "box_detail", concurrency=20, n=500,
            make_request=lambda c, i: timed(c, "GET", f"/api/boxes/public/{random.randint(1, 100)}/"),
        )

        # ---- 5. Featured boxes ----
        await run_scenario(
            "box_featured", concurrency=20, n=300,
            make_request=lambda c, i: timed(c, "GET", "/api/boxes/public/featured/"),
        )

        # ---- 6. Popular boxes ----
        await run_scenario(
            "box_popular", concurrency=20, n=300,
            make_request=lambda c, i: timed(c, "GET", "/api/boxes/public/popular/"),
        )

        # ---- 7. Nearby boxes (Haversine computed in Python per box) ----
        await run_scenario(
            "box_nearby", concurrency=20, n=300,
            make_request=lambda c, i: timed(c, "GET", "/api/boxes/public/nearby/", params={"lat": 19.0760, "lng": 72.8777, "radius": 50}),
        )

        # ---- 8. booked_slots (public, polled every 30s by real frontend) ----
        future_day = (date.today() + timedelta(days=random.randint(1, 30))).isoformat()
        await run_scenario(
            "booked_slots", concurrency=20, n=300,
            make_request=lambda c, i: timed(c, "GET", "/api/bookings/booked_slots/", params={"box_id": random.randint(1, 100), "date": future_day}),
        )

        # ---- 9. Login (PBKDF2 hash verification, CPU-bound) ----
        await run_scenario(
            "login", concurrency=10, n=200,
            make_request=lambda c, i: timed(c, "POST", "/api/user/login/", json={"email": random.choice(user_emails), "password": PASSWORD}),
        )

        # ---- 10. Register (PBKDF2 hash creation + unique DB write) ----
        await run_scenario(
            "register", concurrency=10, n=100,
            make_request=lambda c, i: timed(c, "POST", "/api/user/register/", json={
                "email": f"loadgen_{rand_suffix()}@loadtest.local",
                "username": f"loadgen_{rand_suffix()}@loadtest.local",
                "password": PASSWORD, "confirm_password": PASSWORD,
                "role": "user", "phone": f"7{random.randint(100000000, 999999999)}", "location": "Mumbai",
            }),
        )

        # ---- 11. Authenticated dashboard analytics ----
        dash_users = [f"stress_user{i}@loadtest.local" for i in range(30, 40)]
        dash_tokens = await get_tokens(setup_client, dash_users)
        dash_token_list = list(dash_tokens.values())
        await run_scenario(
            "dashboard_analytics", concurrency=15, n=300,
            make_request=lambda c, i: timed(c, "GET", "/api/dashboard/analytics/", headers={"Authorization": f"Bearer {random.choice(dash_token_list)}"}),
        )

        # ---- 12. Reserve throughput on distinct slots (no queueing) ----
        reserve_users = [f"stress_user{i}@loadtest.local" for i in range(10, 20)]
        reserve_tokens = await get_tokens(setup_client, reserve_users)
        reserve_token_list = list(reserve_tokens.values())
        counter = {"n": 0}

        def make_reserve_distinct(c, i):
            counter["n"] += 1
            k = counter["n"]
            day = (date.today() + timedelta(days=40 + (k % 60))).isoformat()
            hour = 6 + (k % 16)
            token = reserve_token_list[k % len(reserve_token_list)]
            return timed(c, "POST", "/api/bookings/reserve/", headers={"Authorization": f"Bearer {token}"}, json={
                "boxId": (k % 100) + 1, "date": day, "startTime": f"{hour:02d}:00", "duration": 1,
            })

        await run_scenario("reserve_distinct_slots", concurrency=15, n=300, make_request=make_reserve_distinct)

        # ---- 13. Rate-limit correctness check (single user, sequential burst) ----
        rl_user = "stress_user48@loadtest.local"
        rl_token = (await get_tokens(setup_client, [rl_user]))[rl_user]
        rl_counter = {"n": 0}

        def make_rl(c, i):
            rl_counter["n"] += 1
            k = rl_counter["n"]
            day = (date.today() + timedelta(days=200 + k)).isoformat()
            return timed(c, "POST", "/api/bookings/reserve/", headers={"Authorization": f"Bearer {rl_token}"}, json={
                "boxId": 1, "date": day, "startTime": "06:00", "duration": 1,
            })

        rl_result, rl_responses = await run_scenario("rate_limit_check_reserve", concurrency=1, n=12, make_request=make_rl)
        rl_statuses = [r.status_code if r else None for r in rl_responses]
        print(f"rate_limit_check_reserve status sequence: {rl_statuses}")
        print()

        # ---- 14. THE flagship test: single-slot reservation race under constrained resources ----
        race_users = [f"stress_user{i}@loadtest.local" for i in range(20, 50)]
        race_tokens = await get_tokens(setup_client, race_users)
        race_token_list = list(race_tokens.values())
        race_day = (date.today() + timedelta(days=500)).isoformat()

        def make_race_reserve(c, i):
            token = race_token_list[i]
            return timed(c, "POST", "/api/bookings/reserve/", headers={"Authorization": f"Bearer {token}"}, json={
                "boxId": 1, "date": race_day, "startTime": "05:00", "duration": 1,
            })

        race_result, race_responses = await run_scenario(
            "reservation_race_single_slot", concurrency=len(race_token_list), n=len(race_token_list), make_request=make_race_reserve
        )
        held = []
        queued = []
        for idx, r in enumerate(race_responses):
            if r is None:
                continue
            body = r.json()
            if body.get("status") == "held":
                held.append((idx, body))
            elif body.get("status") == "queued":
                queued.append((idx, body["position"]))
        print(f"race result: {len(held)} held (expect 1), {len(queued)} queued (expect {len(race_token_list)-1})")
        positions = sorted(p for _, p in queued)
        print(f"queue positions: min={positions[0] if positions else None} max={positions[-1] if positions else None} unique={len(set(positions))}/{len(positions)}")

        confirm_status = None
        if held:
            idx, body = held[0]
            token = race_token_list[idx]
            async with httpx.AsyncClient(base_url=BASE) as cc:
                dt, status, err, r = await timed(cc, "POST", f"/bookings/confirm/{body['hold_token']}/".replace("/bookings", "/api/bookings"), headers={"Authorization": f"Bearer {token}"})
                confirm_status = status
        print(f"confirm status for the winner: {confirm_status} (expect 201)")
        print()

        # ---- 15. Chatbot endpoint overhead + rate limiter (no real Gemini call, no API key set) ----
        chat_users = [f"stress_user{i}@loadtest.local" for i in range(40, 45)]
        chat_tokens = await get_tokens(setup_client, chat_users)
        chat_token_list = list(chat_tokens.values())
        await run_scenario(
            "chatbot_overhead", concurrency=5, n=200,
            make_request=lambda c, i: timed(c, "POST", "/api/chatbot/", headers={"Authorization": f"Bearer {random.choice(chat_token_list)}"}, json={"message": "hi", "conversation_history": []}),
        )

        # ---- 16. Mixed realistic traffic ramp: find the practical ceiling ----
        mix_users = [f"stress_user{i}@loadtest.local" for i in range(0, 10)]
        mix_tokens = await get_tokens(setup_client, mix_users)
        mix_token_list = list(mix_tokens.values())

        async def mixed_request(c, i):
            roll = random.random()
            if roll < 0.35:
                return await timed(c, "GET", "/api/boxes/public/")
            elif roll < 0.55:
                return await timed(c, "GET", f"/api/boxes/public/{random.randint(1,100)}/")
            elif roll < 0.65:
                return await timed(c, "GET", "/api/boxes/public/nearby/", params={"lat": 19.076, "lng": 72.8777, "radius": 50})
            elif roll < 0.85:
                return await timed(c, "GET", "/api/bookings/booked_slots/", params={"box_id": random.randint(1, 100), "date": future_day})
            elif roll < 0.95:
                return await timed(c, "GET", "/api/dashboard/analytics/", headers={"Authorization": f"Bearer {random.choice(mix_token_list)}"})
            else:
                return await timed(c, "POST", "/api/user/login/", json={"email": random.choice(mix_users), "password": PASSWORD})

        ramp_client = httpx.AsyncClient(base_url=BASE)
        for concurrency in [10, 25, 50, 100, 150]:
            n = concurrency * 8
            await run_scenario(f"mixed_ramp_c{concurrency}", concurrency=concurrency, n=n, make_request=mixed_request, client=ramp_client)
        await ramp_client.aclose()

    with open("/tmp/loadtest_results.json", "w") as f:
        json.dump(RESULTS, f, indent=2)
    print("Saved results to /tmp/loadtest_results.json")


if __name__ == "__main__":
    asyncio.run(main())
