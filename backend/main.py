
import asyncio
import logging
import re
import time
from urllib.parse import quote

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


# ============================================================
# CONFIGURATION
# ============================================================

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("community")


class Settings(BaseSettings):
    ticketmaster_api_key: str = ""
    google_places_api_key: str = ""
    openai_api_key: str = ""
    openai_model: str = "gpt-4.1-mini"
    allowed_origins: str = "*"

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )


settings = Settings()

app = FastAPI(
    title="Community Discovery API",
    version="2.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in settings.allowed_origins.split(",")
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

client = httpx.AsyncClient(
    timeout=20,
    follow_redirects=True,
    headers={
        "User-Agent": "CommunityEventFinder/2.1 (event-discovery)"
    },
)


@app.on_event("shutdown")
async def shutdown():
    await client.aclose()


@app.get("/health")
async def health():
    return {
        "ok": True,
        "service": "community-api",
        "version": "2.1.0",
    }


@app.get("/api/diagnostics")
async def diagnostics():
    return {
        "ticketmaster_configured": bool(
            settings.ticketmaster_api_key
        ),
        "google_places_configured": bool(
            settings.google_places_api_key
        ),
        "openai_configured": bool(
            settings.openai_api_key
        ),
        "metropolitan_search_enabled": True,
        "duplicate_grouping_enabled": True,
    }


# ============================================================
# CONSTANTS
# ============================================================

TICKETMASTER_URL = (
    "https://app.ticketmaster.com/discovery/v2/events.json"
)

GEOCODING_URL = (
    "https://nominatim.openstreetmap.org/search"
)

CATEGORY_SEGMENTS = {
    "music": "KZFzniwnSyZfZ7v7nJ",
    "sports": "KZFzniwnSyZfZ7v7nE",
    "arts": "KZFzniwnSyZfZ7v7na",
    "film": "KZFzniwnSyZfZ7v7nn",
}

CATEGORY_TERMS = {
    "nightlife": "nightlife",
    "festivals": "festival",
    "food": "food",
}

PLACE_TYPES = {
    "restaurants": "restaurant",
    "nightlife": "bar",
    "activities": "tourist_attraction",
    "cafes": "cafe",
    "date-night": "restaurant",
}

# Major cities use known central coordinates.
# All other cities are resolved through geocoding.
#
# These are approximate city centres, not user locations.

CITY_CENTRES = {
    "johannesburg": (-26.2041, 28.0473),
    "joburg": (-26.2041, 28.0473),
    "jozi": (-26.2041, 28.0473),
    "sandton": (-26.1076, 28.0567),
    "randburg": (-26.0941, 27.9828),
    "roodepoort": (-26.1625, 27.8725),
    "soweto": (-26.2485, 27.8540),
    "midrand": (-25.9992, 28.1263),
    "pretoria": (-25.7479, 28.2293),
    "tshwane": (-25.7479, 28.2293),
    "cape town": (-33.9249, 18.4241),
    "durban": (-29.8587, 31.0218),
    "gqeberha": (-33.9608, 25.6022),
    "port elizabeth": (-33.9608, 25.6022),
    "bloemfontein": (-29.0852, 26.1596),
    "london": (51.5074, -0.1278),
    "new york": (40.7128, -74.0060),
    "los angeles": (34.0522, -118.2437),
    "chicago": (41.8781, -87.6298),
    "toronto": (43.6532, -79.3832),
    "paris": (48.8566, 2.3522),
    "berlin": (52.5200, 13.4050),
    "sydney": (-33.8688, 151.2093),
    "melbourne": (-37.8136, 144.9631),
    "dubai": (25.2048, 55.2708),
}

# Approximate radius in kilometres.
# Johannesburg deliberately includes the wider metro.

CITY_RADII = {
    "johannesburg": 50,
    "joburg": 50,
    "jozi": 50,
    "sandton": 25,
    "randburg": 25,
    "roodepoort": 25,
    "soweto": 25,
    "midrand": 25,
    "pretoria": 40,
    "tshwane": 40,
    "cape town": 55,
    "durban": 40,
    "gqeberha": 35,
    "port elizabeth": 35,
    "bloemfontein": 30,
    "london": 35,
    "new york": 35,
    "los angeles": 45,
    "chicago": 35,
    "toronto": 35,
    "paris": 30,
    "berlin": 30,
    "sydney": 40,
    "melbourne": 40,
    "dubai": 40,
}

DEFAULT_RADIUS_KM = 35

# Keep geocoding results in memory to avoid repeat requests.
# Cache is per running server instance.

GEOCODE_CACHE_SECONDS = 86400
geocode_cache = {}
geocode_lock = asyncio.Lock()

# Ticketmaster API page sizes and offsets are limited.
MAX_EVENT_PAGES = 10
DEFAULT_EVENT_PAGES = 10
DEFAULT_PAGE_SIZE = 100


# ============================================================
# GENERAL HELPERS
# ============================================================

def clean_text(value):
    return re.sub(
        r"\s+",
        " ",
        str(value or "").strip(),
    )


def normalized_text(value):
    text = clean_text(value).casefold()
    text = text.replace("&", "and")
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def city_key(city):
    return normalized_text(city)


def image_url(images):
    valid = []

    for image in images or []:
        if not isinstance(image, dict):
            continue

        url = image.get("url")

        if (
            isinstance(url, str)
            and url.strip().startswith(
                ("https://", "http://")
            )
        ):
            valid.append(image)

    if not valid:
        return None

    landscape = [
        image
        for image in valid
        if image.get("ratio") == "16_9"
        and (image.get("width") or 0) >= 640
    ]

    best = max(
        landscape or valid,
        key=lambda image: (
            image.get("width") or 0,
            image.get("height") or 0,
        ),
    )

    return best["url"].strip()


def event_timestamp(event):
    date = event.get("rawDate") or "9999-12-31"
    event_time = event.get("rawTime") or "00:00:00"

    return f"{date}T{event_time}"


def duplicate_key(event):
    title = normalized_text(event.get("title"))
    venue = normalized_text(event.get("location"))
    city = normalized_text(event.get("city"))

    # Preserve distinct events at different venues.
    return f"{title}|{venue}|{city}"


# ============================================================
# CITY GEOCODING
# ============================================================

async def geocode_city(city, country=""):
    key = f"{city_key(city)}|{country.upper()}"

    known = CITY_CENTRES.get(city_key(city))

    if known:
        return known

    cached = geocode_cache.get(key)

    if cached:
        coordinates, expires_at = cached

        if time.monotonic() < expires_at:
            return coordinates

    async with geocode_lock:
        cached = geocode_cache.get(key)

        if cached:
            coordinates, expires_at = cached

            if time.monotonic() < expires_at:
                return coordinates

        params = {
            "q": city,
            "format": "jsonv2",
            "limit": 1,
        }

        if country:
            params["countrycodes"] = country.lower()

        try:
            response = await client.get(
                GEOCODING_URL,
                params=params,
                timeout=12,
            )

            response.raise_for_status()

            results = response.json()

            if not results:
                return None

            result = results[0]

            coordinates = (
                float(result["lat"]),
                float(result["lon"]),
            )

            geocode_cache[key] = (
                coordinates,
                time.monotonic()
                + GEOCODE_CACHE_SECONDS,
            )

            return coordinates

        except (
            httpx.HTTPError,
            ValueError,
            KeyError,
            TypeError,
        ) as exc:
            logger.warning(
                "City geocoding failed for %s: %s",
                city,
                exc,
            )

            return None


async def search_location(city, country):
    coordinates = await geocode_city(city, country)

    if not coordinates:
        # Fallback to Ticketmaster's city search.
        return {
            "city": city,
        }, "city"

    latitude, longitude = coordinates

    radius = CITY_RADII.get(
        city_key(city),
        DEFAULT_RADIUS_KM,
    )

    return {
        "latlong": f"{latitude:.6f},{longitude:.6f}",
        "radius": radius,
        "unit": "km",
    }, "radius"


# ============================================================
# NORMALIZE TICKETMASTER EVENTS
# ============================================================

def event_record(event):
    embedded = event.get("_embedded") or {}

    venue = (
        embedded.get("venues") or [{}]
    )[0]

    start = (
        event.get("dates") or {}
    ).get("start") or {}

    classification = (
        event.get("classifications") or [{}]
    )[0]

    price = (
        event.get("priceRanges") or [{}]
    )[0]

    venue_city = venue.get("city") or {}
    venue_country = venue.get("country") or {}
    venue_address = venue.get("address") or {}
    venue_location = venue.get("location") or {}

    segment = classification.get("segment") or {}
    genre = classification.get("genre") or {}

    raw_date = start.get("localDate")
    raw_time = start.get("localTime")

    return {
        "id": str(event["id"]),
        "kind": "event",
        "title": event.get("name") or "Event",
        "image": image_url(event.get("images")),
        "rawDate": raw_date,
        "rawTime": raw_time,
        "date": raw_date or "Date TBA",
        "location": venue.get("name") or "Venue TBA",
        "city": venue_city.get("name", ""),
        "country": venue_country.get(
            "countryCode", ""
        ),
        "address": venue_address.get(
            "line1", ""
        ),
        "category": segment.get(
            "name", "Event"
        ),
        "genre": genre.get("name", ""),
        "description": (
            event.get("info")
            or event.get("pleaseNote")
            or ""
        ),
        "url": event.get("url"),
        "priceMin": price.get("min"),
        "priceMax": price.get("max"),
        "currency": price.get("currency"),
        "latitude": venue_location.get("latitude"),
        "longitude": venue_location.get("longitude"),
    }


# ============================================================
# GROUP REPEATED PERFORMANCES
# ============================================================

def performance_record(event):
    return {
        "id": event.get("id"),
        "rawDate": event.get("rawDate"),
        "rawTime": event.get("rawTime"),
        "url": event.get("url"),
    }


def group_duplicate_events(events):
    groups = {}

    for event in events:
        key = duplicate_key(event)

        if key not in groups:
            groups[key] = {
                **event,
                "performanceCount": 1,
                "performanceDates": [
                    performance_record(event)
                ],
            }
            continue

        existing = groups[key]

        performances = existing[
            "performanceDates"
        ] + [performance_record(event)]

        earlier = (
            event_timestamp(event)
            < event_timestamp(existing)
        )

        preferred = event if earlier else existing
        other = existing if earlier else event

        groups[key] = {
            **preferred,
            "image": (
                preferred.get("image")
                or other.get("image")
            ),
            "description": (
                preferred.get("description")
                or other.get("description")
                or ""
            ),
            "url": (
                preferred.get("url")
                or other.get("url")
            ),
            "performanceCount": len(
                performances
            ),
            "performanceDates": performances,
        }

    unique = list(groups.values())

    for event in unique:
        event["performanceDates"].sort(
            key=lambda performance: (
                performance.get("rawDate")
                or "9999-12-31",
                performance.get("rawTime")
                or "00:00:00",
            )
        )

    unique.sort(key=event_timestamp)

    return unique


# ============================================================
# TICKETMASTER FETCHING
# ============================================================

async def fetch_ticketmaster_page(base_params, page):
    try:
        response = await client.get(
            TICKETMASTER_URL,
            params={**base_params, "page": page},
        )
        response.raise_for_status()
        data = response.json()
        page_info = data.get("page") or {}
        return {
            "items": (data.get("_embedded") or {}).get("events") or [],
            "totalPages": page_info.get("totalPages"),
            "totalElements": page_info.get("totalElements"),
        }
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Ticketmaster page %s failed: %s", page, exc)
        return None


# Avoid repeated requests for identical searches from the mobile app.
EVENT_CACHE_SECONDS = 300
EVENT_CACHE = {}
EVENT_CACHE_LOCK = asyncio.Lock()

# Country codes for the known South African locations. Other cities can
# still be searched without a country code if the user hasn't provided one.
SA_CITIES = {
    "johannesburg", "joburg", "jozi", "sandton", "randburg",
    "roodepoort", "soweto", "midrand", "pretoria", "tshwane",
    "cape town", "durban", "gqeberha", "port elizabeth",
    "bloemfontein",
}

# Ticketmaster's Discovery API permits a limited deep-pagination window.
# Use the largest supported page size and fetch all pages in that window.
TICKETMASTER_WINDOW = 1000


async def fetch_search_strategy(label, params, max_pages, size):
    first = await fetch_ticketmaster_page(params, 0)
    if first is None:
        return {
            "name": label,
            "items": [],
            "totalElements": None,
            "pagesFetched": 0,
            "partial": True,
            "failed": True,
        }

    advertised = first.get("totalPages")
    if isinstance(advertised, int):
        count = min(max_pages, max(1, advertised))
    else:
        count = max_pages
    count = min(count, max(1, TICKETMASTER_WINDOW // size))

    remaining = []
    if count > 1:
        remaining = await asyncio.gather(*[
            fetch_ticketmaster_page(params, page)
            for page in range(1, count)
        ])

    results = [first, *remaining]
    items = [
        event
        for result in results if result is not None
        for event in result["items"]
    ]
    return {
        "name": label,
        "items": items,
        "totalElements": first.get("totalElements"),
        "pagesFetched": sum(result is not None for result in results),
        "partial": any(result is None for result in results)
            or (isinstance(advertised, int) and advertised > count),
        "failed": False,
    }


@app.get("/api/events")
async def events(
    city: str = Query("Johannesburg", min_length=1, max_length=100),
    country: str = Query("", max_length=2),
    category: str = "all",
    keyword: str = Query("", max_length=100),
    pages: int = Query(DEFAULT_EVENT_PAGES, ge=1, le=MAX_EVENT_PAGES),
    size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=100),
):
    if not settings.ticketmaster_api_key:
        raise HTTPException(503, "Ticketmaster is not configured")

    city = clean_text(city)
    country = country.strip().upper()
    category = category.strip().lower()
    keyword = clean_text(keyword)

    # This prevents a South African city query from unintentionally
    # matching an identically named city in another country.
    effective_country = country or ("ZA" if city_key(city) in SA_CITIES else "")
    location_params, location_mode = await search_location(city, effective_country)

    common = {
        "apikey": settings.ticketmaster_api_key,
        "size": size,
        "sort": "date,asc",
    }
    if effective_country:
        common["countryCode"] = effective_country
    if category in CATEGORY_SEGMENTS:
        common["segmentId"] = CATEGORY_SEGMENTS[category]
    if keyword:
        common["keyword"] = keyword
    elif category in CATEGORY_TERMS:
        common["keyword"] = CATEGORY_TERMS[category]

    # Union of two independent Discovery searches: the requested city
    # AND the metropolitan radius. A city-filtered event may have no
    # coordinates; a radius-filtered event may use a suburb city name.
    strategies = [("city", {**common, "city": city})]
    if location_mode == "radius":
        strategies.append(("radius", {**common, **location_params}))

    cache_key = (city_key(city), effective_country, category, keyword.casefold(), pages, size)
    now = time.monotonic()
    cached = EVENT_CACHE.get(cache_key)
    if cached and cached[0] > now:
        return cached[1]

    async with EVENT_CACHE_LOCK:
        cached = EVENT_CACHE.get(cache_key)
        if cached and cached[0] > time.monotonic():
            return cached[1]

        searches = await asyncio.gather(*[
            fetch_search_strategy(name, params, MAX_EVENT_PAGES, size)
            for name, params in strategies
        ])
        if all(search["failed"] for search in searches):
            raise HTTPException(502, "Ticketmaster searches are temporarily unavailable")

        # IDs are the authoritative way to eliminate identical listings
        # returned by both strategies.
        by_id = {}
        for search in searches:
            for item in search["items"]:
                event_id = item.get("id")
                if event_id:
                    by_id.setdefault(str(event_id), item)

        normalized = []
        for item in by_id.values():
            try:
                normalized.append(event_record(item))
            except (ValueError, TypeError, KeyError) as exc:
                logger.warning("Skipping invalid Ticketmaster event: %s", exc)

        unique_events = group_duplicate_events(normalized)
        partial = any(search["partial"] for search in searches)
        stats = [
            {
                "strategy": search["name"],
                "providerTotalElements": search["totalElements"],
                "recordsFetched": len(search["items"]),
                "pagesFetched": search["pagesFetched"],
                "partial": search["partial"],
            }
            for search in searches
        ]

        result = {
            "items": unique_events,
            "count": len(unique_events),
            "source": "ticketmaster",
            "partial": partial,
            "city": city,
            "country": effective_country,
            "searchMode": "radius" if len(strategies) > 1 else "city",
            "searchStrategies": [name for name, _ in strategies],
            "radiusKm": location_params.get("radius") if location_mode == "radius" else None,
            "totalPerformances": len(normalized),
            "duplicatesRemoved": len(normalized) - len(unique_events),
            "providerTotalElements": sum(
                search["totalElements"] or 0 for search in searches
            ),
            "pagesFetched": sum(search["pagesFetched"] for search in searches),
            "searches": stats,
            "apiCoverageGuaranteed": False,
        }
        logger.info(
            "Ticketmaster combined city=%s country=%s raw=%s unique=%s searches=%s",
            city, effective_country, len(normalized), len(unique_events), stats,
        )
        EVENT_CACHE[cache_key] = (time.monotonic() + EVENT_CACHE_SECONDS, result)
        # Prevent unbounded cache growth on long-lived servers.
        if len(EVENT_CACHE) > 150:
            for key in list(EVENT_CACHE):
                if EVENT_CACHE[key][0] <= time.monotonic():
                    del EVENT_CACHE[key]
        return result


# ============================================================
# GOOGLE PLACES
# ============================================================

def place_record(place):
    name = (
        place.get("displayName") or {}
    ).get("text", "Place")

    photo = (
        place.get("photos") or [{}]
    )[0].get("name")

    location = place.get("location") or {}

    return {
        "id": place.get("id", ""),
        "kind": "place",
        "title": name,
        "image": (
            f'/api/place-photo?name={quote(photo, safe="")}'
            if photo
            else None
        ),
        "location": place.get(
            "formattedAddress", ""
        ),
        "address": place.get(
            "formattedAddress", ""
        ),
        "city": "",
        "category": (
            place.get("primaryTypeDisplayName")
            or {}
        ).get("text", "Place"),
        "rating": place.get("rating"),
        "reviewCount": place.get(
            "userRatingCount"
        ),
        "priceLevel": place.get(
            "priceLevel"
        ),
        "url": place.get("googleMapsUri"),
        "latitude": location.get("latitude"),
        "longitude": location.get("longitude"),
        "date": "Open hours vary",
    }


@app.get("/api/places")
async def places(
    city: str = Query(
        "Johannesburg",
        min_length=1,
        max_length=100,
    ),
    country: str = Query(
        "",
        max_length=2,
    ),
    category: str = "restaurants",
    limit: int = Query(
        20,
        ge=1,
        le=20,
    ),
):
    if not settings.google_places_api_key:
        raise HTTPException(
            503,
            "Google Places is not configured",
        )

    if category not in PLACE_TYPES:
        raise HTTPException(
            400,
            "Unsupported places category",
        )

    query = (
        f'{category.replace("-", " ")} in {city}'
        + (f", {country}" if country else "")
    )

    payload = {
        "textQuery": query,
        "pageSize": limit,
        "includedType": PLACE_TYPES[category],
    }

    headers = {
        "X-Goog-Api-Key": (
            settings.google_places_api_key
        ),
        "X-Goog-FieldMask": (
            "places.id,"
            "places.displayName,"
            "places.formattedAddress,"
            "places.photos,"
            "places.rating,"
            "places.userRatingCount,"
            "places.priceLevel,"
            "places.googleMapsUri,"
            "places.location,"
            "places.primaryTypeDisplayName"
        ),
        "Content-Type": "application/json",
    }

    try:
        response = await client.post(
            "https://places.googleapis.com/v1/"
            "places:searchText",
            json=payload,
            headers=headers,
        )

        response.raise_for_status()

        items = response.json().get(
            "places", []
        )

        return {
            "items": [
                place_record(place)
                for place in items
            ],
            "count": len(items),
            "source": "google_places",
        }

    except (
        httpx.HTTPError,
        ValueError,
    ) as exc:
        logger.warning(
            "Places search failed: %s",
            exc,
        )

        raise HTTPException(
            502,
            "Places provider temporarily unavailable",
        )


# ============================================================
# GOOGLE PLACE PHOTOS
# ============================================================

@app.get("/api/place-photo")
async def place_photo(
    name: str = Query(
        ...,
        min_length=10,
        max_length=500,
    ),
):
    if not settings.google_places_api_key:
        raise HTTPException(
            503,
            "Photos unavailable",
        )

    if not re.fullmatch(
        r"places/[^/]+/photos/[^/]+",
        name,
    ):
        raise HTTPException(
            400,
            "Invalid photo reference",
        )

    try:
        response = await client.get(
            f"https://places.googleapis.com/v1/"
            f"{name}/media",
            params={
                "maxWidthPx": 900,
            },
            headers={
                "X-Goog-Api-Key": (
                    settings.google_places_api_key
                ),
            },
        )

        response.raise_for_status()

        content_type = response.headers.get(
            "content-type",
            "image/jpeg",
        )

        if not content_type.startswith("image/"):
            raise HTTPException(
                502,
                "Unexpected photo response",
            )

        return Response(
            content=response.content,
            media_type=content_type,
            headers={
                "Cache-Control": (
                    "public, max-age=3600"
                ),
            },
        )

    except httpx.HTTPError:
        raise HTTPException(
            502,
            "Photo provider unavailable",
        )


# ============================================================
# AI CONCIERGE
# ============================================================

class ConciergeRequest(BaseModel):
    message: str = Field(
        min_length=2,
        max_length=700,
    )
    city: str = Field(
        min_length=1,
        max_length=100,
    )
    country: str = Field(
        default="",
        max_length=2,
    )
    candidates: list[dict] = Field(
        default_factory=list,
        max_length=30,
    )


@app.post("/api/concierge")
async def concierge(body: ConciergeRequest):
    if not settings.openai_api_key:
        raise HTTPException(
            503,
            "Community AI is not configured",
        )

    candidates = [
        {
            "id": str(
                candidate.get("id", "")
            )[:100],
            "kind": str(
                candidate.get("kind", "")
            )[:20],
            "title": str(
                candidate.get("title", "")
            )[:140],
            "location": str(
                candidate.get("location", "")
            )[:160],
            "date": str(
                candidate.get("date", "")
            )[:80],
            "url": str(
                candidate.get("url", "")
            )[:300],
        }
        for candidate in body.candidates
    ]

    prompt = (
        f"City: {body.city}; "
        f"country code: "
        f"{body.country or 'unknown'}. "
        f"User request: {body.message}. "
        f"Available provider candidates: "
        f"{candidates}"
    )

    try:
        ai = AsyncOpenAI(
            api_key=settings.openai_api_key,
            timeout=20,
        )

        response = (
            await ai.chat.completions.create(
                model=settings.openai_model,
                temperature=0.5,
                max_tokens=450,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are Community, a "
                            "concise, warm worldwide "
                            "lifestyle concierge. "
                            "Recommend only candidates "
                            "supplied in the prompt as "
                            "verified listings. "
                            "Do not invent names, prices, "
                            "availability, times, "
                            "reservations, or ticket access. "
                            "If there are no relevant "
                            "candidates, say more live "
                            "results are needed and "
                            "suggest search terms. "
                            "Never claim to have booked "
                            "anything. Respect the user "
                            "budget and location."
                        ),
                    },
                    {
                        "role": "user",
                        "content": prompt,
                    },
                ],
            )
        )

        return {
            "answer": (
                response.choices[0].message.content
                or "Try another mood or city."
            ),
            "candidateIds": [
                candidate["id"]
                for candidate in candidates
            ],
        }

    except Exception as exc:
        logger.warning(
            "Concierge failed: %s",
            type(exc).__name__,
        )

        raise HTTPException(
            502,
            "AI concierge temporarily unavailable",
        )
