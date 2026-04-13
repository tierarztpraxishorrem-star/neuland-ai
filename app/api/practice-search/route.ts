const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

const sanitize = (value: unknown) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = sanitize(searchParams.get('q'));

    if (!query || query.length < 3) {
      return Response.json({ results: [] });
    }

    const url = `${NOMINATIM_URL}?format=jsonv2&addressdetails=1&limit=8&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'neuland-ai-practice-search/1.0'
      },
      cache: 'no-store'
    });

    if (!res.ok) {
      return Response.json({ results: [] });
    }

    const json = (await res.json()) as Array<any>;

    const results = (json || []).map((item) => {
      const address = item?.address || {};
      const name =
        sanitize(address?.clinic) ||
        sanitize(address?.hospital) ||
        sanitize(address?.amenity) ||
        sanitize(item?.name) ||
        sanitize(item?.display_name?.split(',')?.[0]) ||
        'Praxis';

      const street = [sanitize(address?.road), sanitize(address?.house_number)].filter(Boolean).join(' ');
      const city = sanitize(address?.city || address?.town || address?.village);
      const postcode = sanitize(address?.postcode);
      const country = sanitize(address?.country);
      const formattedAddress = [street, [postcode, city].filter(Boolean).join(' '), country]
        .filter(Boolean)
        .join(', ');

      return {
        placeId: sanitize(item?.place_id),
        osmType: sanitize(item?.osm_type),
        osmId: sanitize(item?.osm_id),
        name,
        displayName: sanitize(item?.display_name),
        address: formattedAddress || sanitize(item?.display_name),
        lat: sanitize(item?.lat),
        lon: sanitize(item?.lon)
      };
    });

    return Response.json({ results });
  } catch (error: any) {
    return Response.json(
      { error: error?.message || 'practice_search_failed', results: [] },
      { status: 500 }
    );
  }
}
