import asyncio
import logging
import os
import re
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import quote

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('community')

class Settings(BaseSettings):
    ticketmaster_api_key: str = ''
    google_places_api_key: str = ''
    openai_api_key: str = ''
    openai_model: str = 'gpt-4.1-mini'
    allowed_origins: str = '*'
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

settings = Settings()
app = FastAPI(title='Community Discovery API', version='2.0.0')
app.add_middleware(CORSMiddleware, allow_origins=[s.strip() for s in settings.allowed_origins.split(',')], allow_credentials=False, allow_methods=['GET','POST'], allow_headers=['Content-Type'])
client = httpx.AsyncClient(timeout=18, follow_redirects=True)

@app.on_event('shutdown')
async def shutdown():
    await client.aclose()

@app.get('/health')
async def health():
    return {'ok': True, 'service': 'community-api'}

CATEGORY_SEGMENTS = {'music': 'KZFzniwnSyZfZ7v7nJ', 'sports': 'KZFzniwnSyZfZ7v7nE', 'arts': 'KZFzniwnSyZfZ7v7na', 'film': 'KZFzniwnSyZfZ7v7nn'}
CATEGORY_TERMS = {'nightlife':'nightlife', 'festivals':'festival', 'food':'food'}
PLACE_TYPES = {'restaurants':'restaurant','nightlife':'bar','activities':'tourist_attraction','cafes':'cafe','date-night':'restaurant'}

def image_url(images):
    images = images or []
    options = sorted(images, key=lambda im: (im.get('ratio') == '16_9', im.get('width', 0)), reverse=True)
    return options[0].get('url') if options else None

def event_record(event):
    venue = (event.get('_embedded', {}).get('venues') or [{}])[0]
    start = event.get('dates', {}).get('start', {})
    classification = (event.get('classifications') or [{}])[0]
    price = (event.get('priceRanges') or [{}])[0]
    return {'id':str(event['id']), 'kind':'event', 'title':event.get('name','Event'), 'image':image_url(event.get('images')), 'rawDate':start.get('localDate'), 'rawTime':start.get('localTime'), 'date':start.get('localDate') or 'Date TBA', 'location':venue.get('name') or 'Venue TBA', 'city':venue.get('city',{}).get('name',''), 'country':venue.get('country',{}).get('countryCode',''), 'address':venue.get('address',{}).get('line1',''), 'category':classification.get('segment',{}).get('name','Event'), 'genre':classification.get('genre',{}).get('name',''), 'description':event.get('info') or event.get('pleaseNote') or '', 'url':event.get('url'), 'priceMin':price.get('min'), 'priceMax':price.get('max'), 'currency':price.get('currency'), 'latitude':venue.get('location',{}).get('latitude'), 'longitude':venue.get('location',{}).get('longitude')}

@app.get('/api/events')
async def events(city: str = Query('Johannesburg', min_length=1, max_length=100), country: str = Query('', max_length=2), category: str = 'all', keyword: str = Query('', max_length=100), pages: int = Query(2, ge=1, le=4), size: int = Query(50, ge=1, le=100)):
    if not settings.ticketmaster_api_key:
        raise HTTPException(503, 'Ticketmaster is not configured')
    base = {'apikey':settings.ticketmaster_api_key, 'city':city, 'size':size, 'sort':'date,asc'}
    if country: base['countryCode'] = country.upper()
    if category in CATEGORY_SEGMENTS: base['segmentId'] = CATEGORY_SEGMENTS[category]
    if keyword.strip(): base['keyword'] = keyword.strip()
    elif category in CATEGORY_TERMS: base['keyword'] = CATEGORY_TERMS[category]
    async def get_page(page):
        try:
            response = await client.get('https://app.ticketmaster.com/discovery/v2/events.json', params={**base,'page':page})
            response.raise_for_status()
            return response.json().get('_embedded',{}).get('events',[])
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning('Ticketmaster page %s failed: %s', page, exc)
            return None
    results = await asyncio.gather(*(get_page(p) for p in range(pages)))
    if all(result is None for result in results):
        raise HTTPException(502, 'Event provider temporarily unavailable')
    seen = set()
    normalized = []
    for page in results:
        for item in page or []:
            if item.get('id') and item['id'] not in seen:
                seen.add(item['id'])
                normalized.append(event_record(item))
    normalized.sort(key=lambda e: (e['rawDate'] or '9999-12-31', e['rawTime'] or ''))
    return {'items':normalized, 'count':len(normalized), 'source':'ticketmaster', 'partial':any(x is None for x in results)}

def place_record(place):
    name = place.get('displayName',{}).get('text','Place')
    photo = (place.get('photos') or [{}])[0].get('name')
    return {'id':place.get('id',''), 'kind':'place', 'title':name, 'image':f'/api/place-photo?name={quote(photo, safe="")}' if photo else None, 'location':place.get('formattedAddress',''), 'address':place.get('formattedAddress',''), 'city':'', 'category':(place.get('primaryTypeDisplayName') or {}).get('text','Place'), 'rating':place.get('rating'), 'reviewCount':place.get('userRatingCount'), 'priceLevel':place.get('priceLevel'), 'url':place.get('googleMapsUri'), 'latitude':place.get('location',{}).get('latitude'), 'longitude':place.get('location',{}).get('longitude'), 'date':'Open hours vary'}

@app.get('/api/places')
async def places(city: str = Query('Johannesburg', min_length=1, max_length=100), country: str = Query('', max_length=2), category: str = 'restaurants', limit: int = Query(20, ge=1, le=20)):
    if not settings.google_places_api_key:
        raise HTTPException(503, 'Google Places is not configured')
    if category not in PLACE_TYPES:
        raise HTTPException(400, 'Unsupported places category')
    query = f'{category.replace("-", " ")} in {city}' + (f', {country}' if country else '')
    payload = {'textQuery':query, 'pageSize':limit, 'includedType':PLACE_TYPES[category]}
    headers = {'X-Goog-Api-Key':settings.google_places_api_key, 'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.photos,places.rating,places.userRatingCount,places.priceLevel,places.googleMapsUri,places.location,places.primaryTypeDisplayName', 'Content-Type':'application/json'}
    try:
        response = await client.post('https://places.googleapis.com/v1/places:searchText', json=payload, headers=headers)
        response.raise_for_status()
        items = response.json().get('places',[])
        return {'items':[place_record(p) for p in items], 'count':len(items), 'source':'google_places'}
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning('Places search failed: %s', exc)
        raise HTTPException(502, 'Places provider temporarily unavailable')

from fastapi.responses import Response
@app.get('/api/place-photo')
async def place_photo(name: str = Query(..., min_length=10, max_length=500)):
    if not settings.google_places_api_key:
        raise HTTPException(503, 'Photos unavailable')
    if not re.fullmatch(r'places/[^/]+/photos/[^/]+', name):
        raise HTTPException(400, 'Invalid photo reference')
    try:
        response = await client.get(f'https://places.googleapis.com/v1/{name}/media', params={'maxWidthPx':900}, headers={'X-Goog-Api-Key':settings.google_places_api_key})
        response.raise_for_status()
        content_type = response.headers.get('content-type', 'image/jpeg')
        if not content_type.startswith('image/'):
            raise HTTPException(502, 'Unexpected photo response')
        return Response(content=response.content, media_type=content_type, headers={'Cache-Control':'public, max-age=3600'})
    except httpx.HTTPError:
        raise HTTPException(502, 'Photo provider unavailable')

class ConciergeRequest(BaseModel):
    message: str = Field(min_length=2, max_length=700)
    city: str = Field(min_length=1, max_length=100)
    country: str = Field(default='', max_length=2)
    candidates: list[dict] = Field(default_factory=list, max_length=30)

@app.post('/api/concierge')
async def concierge(body: ConciergeRequest):
    if not settings.openai_api_key:
        raise HTTPException(503, 'Community AI is not configured')
    candidates = [{'id':str(c.get('id',''))[:100], 'kind':str(c.get('kind',''))[:20], 'title':str(c.get('title',''))[:140], 'location':str(c.get('location',''))[:160], 'date':str(c.get('date',''))[:80], 'url':str(c.get('url',''))[:300]} for c in body.candidates]
    prompt = f'City: {body.city}; country code: {body.country or "unknown"}. User request: {body.message}. Available provider candidates: {candidates}'
    try:
        ai = AsyncOpenAI(api_key=settings.openai_api_key, timeout=20)
        response = await ai.chat.completions.create(model=settings.openai_model, temperature=0.5, max_tokens=450, messages=[{'role':'system','content':'You are Community, a concise, warm worldwide lifestyle concierge. Recommend only candidates supplied in the prompt as verified listings. Do not invent names, prices, availability, times, reservations, or ticket access. If there are no relevant candidates, say more live results are needed and suggest search terms. Never claim to have booked anything. Respect the user budget and location.'},{'role':'user','content':prompt}])
        return {'answer':response.choices[0].message.content or 'Try another mood or city.', 'candidateIds':[c['id'] for c in candidates]}
    except Exception as exc:
        logger.warning('Concierge failed: %s', type(exc).__name__)
        raise HTTPException(502, 'AI concierge temporarily unavailable')
