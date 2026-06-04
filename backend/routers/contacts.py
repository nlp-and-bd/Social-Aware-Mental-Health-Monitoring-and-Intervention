"""
Emergency-contact consent confirmation.

Serves a branded HTML page the contact lands on after clicking the link in the
double-opt-in email. This works even when the Next.js frontend isn't running,
since FastAPI returns the page directly.
"""

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

from backend.services import mongo_service

router = APIRouter(tags=["contacts"])


def _page(heading: str, body: str, accent: str = "#8b5cf6") -> HTMLResponse:
    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Penumbra</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: linear-gradient(160deg, #0d0a1a 0%, #120d24 50%, #1a1035 100%);
    color: #1a1035; padding: 24px;
  }}
  .card {{
    background: #ffffff; border-radius: 24px; max-width: 460px; width: 100%;
    padding: 40px 36px; box-shadow: 0 24px 70px rgba(0,0,0,0.45); text-align: center;
  }}
  .badge {{
    width: 64px; height: 64px; border-radius: 50%; margin: 0 auto 22px;
    display: flex; align-items: center; justify-content: center;
    background: {accent}1f; color: {accent}; font-size: 30px;
  }}
  h1 {{ font-size: 22px; margin: 0 0 12px; color: #1a1035; }}
  p {{ font-size: 15px; line-height: 1.6; color: #555; margin: 0 0 8px; }}
  .brand {{ margin-top: 26px; font-size: 13px; color: #aaa; letter-spacing: 0.04em; }}
</style>
</head>
<body>
  <div class="card">
    <div class="badge">{'✓' if accent == '#10b981' else '☾'}</div>
    <h1>{heading}</h1>
    {body}
    <div class="brand">— Penumbra</div>
  </div>
</body>
</html>"""
    return HTMLResponse(html)


@router.get("/contacts/consent/confirm", response_class=HTMLResponse)
async def confirm_consent(token: str = ""):
    result = await mongo_service.grant_contact_consent(token)
    if not result:
        return _page(
            "This link is no longer valid",
            "<p>It may have already been used, or the request was withdrawn. "
            "You don't need to do anything else.</p>",
            accent="#8b5cf6",
        )
    name = result["contact_name"]
    who = result["user_display"]
    return _page(
        f"Thank you, {name}",
        f"<p>You've confirmed that you're willing to be there for "
        f"<strong>{who}</strong> when they need a little extra care.</p>"
        f"<p>If they ever reach out through Penumbra, you may receive a gentle, "
        f"non-clinical note about how they're doing — never a diagnosis, and only "
        f"with their explicit choice in the moment.</p>",
        accent="#10b981",
    )
