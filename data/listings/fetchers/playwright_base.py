"""Shared Playwright browser instance for all fetchers.

Manages a single Chromium browser + context reused across tiles. PerimeterX
is bypassed because Playwright runs a real browser with a valid JS execution
context — once the initial challenge is solved the session cookie persists.

Stealth patches remove the most common automation fingerprints without needing
an external package. Call PlaywrightBrowser.close_instance() at the end of a
run to release the browser process.
"""
import logging
from typing import Optional

from playwright.sync_api import Browser, BrowserContext, Page, Playwright, sync_playwright

logger = logging.getLogger(__name__)

_STEALTH_SCRIPT = """
    // Hide webdriver flag (main PerimeterX check)
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

    // Fake plugin list (headless chrome has none by default)
    Object.defineProperty(navigator, 'plugins', {
        get: () => [{ name: 'Chrome PDF Plugin' }, { name: 'Chrome PDF Viewer' }]
    });

    // Languages
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

    // Chrome runtime object expected by fingerprint scripts
    window.chrome = { runtime: {} };

    // Permissions API spoofing
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (params) =>
        params.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission })
            : originalQuery(params);
"""


class PlaywrightBrowser:
    """Singleton Playwright browser + context shared across all fetcher instances."""

    _instance: Optional["PlaywrightBrowser"] = None

    def __init__(self) -> None:
        self._pw: Playwright = sync_playwright().start()
        self._browser: Browser = self._pw.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
                "--window-size=1280,800",
            ],
        )
        self._context: BrowserContext = self._browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            locale="en-US",
            timezone_id="America/New_York",
            java_script_enabled=True,
        )
        self._context.add_init_script(_STEALTH_SCRIPT)
        logger.info("Playwright browser started")

    def new_page(self) -> Page:
        return self._context.new_page()

    def close(self) -> None:
        try:
            self._browser.close()
            self._pw.stop()
            logger.info("Playwright browser closed")
        except Exception as exc:
            logger.warning(f"Error closing Playwright browser: {exc}")

    @classmethod
    def get_instance(cls) -> "PlaywrightBrowser":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def close_instance(cls) -> None:
        if cls._instance is not None:
            cls._instance.close()
            cls._instance = None
