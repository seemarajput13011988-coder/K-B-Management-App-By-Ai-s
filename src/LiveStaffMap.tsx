import { useEffect, useRef, useState } from 'react';

type StaffMember = { id: string; displayName: string; active: boolean };
type StaffLocation = { userId: string; displayName: string; latitude: number; longitude: number; accuracy: number; capturedAt: string };

declare global {
  interface Window {
    google?: any;
    __kandbGoogleMapsLoader?: Promise<void>;
  }
}

const mapsKey = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();

function loadGoogleMaps(): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (window.__kandbGoogleMapsLoader) return window.__kandbGoogleMapsLoader;
  window.__kandbGoogleMapsLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-kandb-google-maps]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google Maps could not load.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.dataset.kandbGoogleMaps = 'true';
    script.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(mapsKey) + '&v=weekly';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Maps could not load. Check the Maps JavaScript API key and billing/API settings.'));
    document.head.appendChild(script);
  });
  return window.__kandbGoogleMapsLoader;
}

export default function LiveStaffMap({ locations, staff }: { locations: StaffLocation[]; staff: StaffMember[] }) {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [mapError, setMapError] = useState('');
  const validLocations = locations.filter(point =>
    Number.isFinite(point.latitude) && Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180
  );

  useEffect(() => {
    let cancelled = false;
    if (!mapsKey || !mapElement.current) return;
    loadGoogleMaps().then(() => {
      if (cancelled || !mapElement.current || !window.google?.maps) return;
      const maps = window.google.maps;
      if (!mapRef.current) {
        mapRef.current = new maps.Map(mapElement.current, {
          center: { lat: 20.5937, lng: 78.9629 },
          zoom: 5,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
        });
      }
      markersRef.current.forEach(marker => marker.setMap(null));
      markersRef.current = [];
      if (!validLocations.length) return;
      const bounds = new maps.LatLngBounds();
      const infoWindow = new maps.InfoWindow();
      validLocations.forEach(point => {
        const position = { lat: point.latitude, lng: point.longitude };
        bounds.extend(position);
        const ageMs = Math.max(0, Date.now() - new Date(point.capturedAt).getTime());
        const status = ageMs < 90000 ? 'Recently updated location' : 'Last known location';
        const marker = new maps.Marker({
          map: mapRef.current,
          position,
          title: point.displayName,
          label: { text: point.displayName.slice(0, 1).toUpperCase(), color: '#ffffff', fontWeight: '700' },
        });
        marker.addListener('click', () => {
          const content = document.createElement('div');
          content.style.cssText = 'padding:6px 8px;min-width:170px;color:#172033;font:14px Arial,sans-serif';
          const name = document.createElement('strong');
          name.textContent = point.displayName;
          const state = document.createElement('div');
          state.textContent = status;
          state.style.marginTop = '5px';
          const time = document.createElement('div');
          time.textContent = 'Updated: ' + new Date(point.capturedAt).toLocaleString('en-IN');
          time.style.marginTop = '4px';
          const accuracy = document.createElement('div');
          accuracy.textContent = 'Accuracy: ±' + Math.round(point.accuracy || 0) + ' m';
          accuracy.style.marginTop = '4px';
          content.append(name, state, time, accuracy);
          infoWindow.setContent(content);
          infoWindow.open({ map: mapRef.current, anchor: marker });
        });
        markersRef.current.push(marker);
      });
      if (validLocations.length === 1) {
        mapRef.current.setCenter(bounds.getCenter());
        mapRef.current.setZoom(16);
      } else {
        mapRef.current.fitBounds(bounds, 56);
      }
      setMapError('');
    }).catch(error => {
      if (!cancelled) setMapError(error instanceof Error ? error.message : 'Google Maps failed to load.');
    });
    return () => { cancelled = true; };
  }, [validLocations.map(point => [point.userId, point.latitude, point.longitude, point.capturedAt].join(':')).join('|')]);

  return <section className="kandb-live-map-card" aria-label="All staff live locations">
    <div className="kandb-live-map-heading">
      <div><strong>All staff locations</strong><span>{validLocations.length} location point{validLocations.length === 1 ? '' : 's'} · refreshes automatically</span></div>
      <span className="kandb-live-map-count">{validLocations.length}/{staff.length} located</span>
    </div>
    {mapsKey
      ? <div ref={mapElement} className="kandb-live-map-canvas" role="application" aria-label="Google map showing all staff locations" />
      : <div className="kandb-live-map-notice"><strong>Google Maps API key is not configured in this build.</strong><span>Add VITE_GOOGLE_MAPS_API_KEY to the web build environment to enable the multi-worker Google Map. The worker location list and individual Google Maps links remain available below.</span></div>}
    {mapError && <div className="kandb-live-map-notice" role="status">{mapError} The location list below is still available.</div>}
    {validLocations.length === 0 && <div className="kandb-live-map-empty">No staff location has been received yet during an active shift.</div>}
    <style>{`
      .kandb-live-map-card{display:grid;gap:12px;margin:14px 0;padding:14px;border:1px solid var(--border,#dce3ed);border-radius:16px;background:var(--surface,#fff)}
      .kandb-live-map-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .kandb-live-map-heading>div{display:grid;gap:3px}.kandb-live-map-heading strong{font-size:15px}.kandb-live-map-heading span{font-size:12px;color:var(--muted,#64748b)}
      .kandb-live-map-count{white-space:nowrap;padding:6px 9px;border-radius:999px;background:var(--surface-soft,#eef3f9);font-weight:700}
      .kandb-live-map-canvas{width:100%;height:390px;min-height:280px;border-radius:12px;overflow:hidden;background:#e8edf3}
      .kandb-live-map-notice,.kandb-live-map-empty{display:grid;gap:6px;padding:14px;border-radius:12px;background:var(--surface-soft,#f3f6fa);font-size:13px;color:var(--text,#243044)}
      .kandb-live-map-notice span{color:var(--muted,#64748b);line-height:1.5}
      @media(max-width:600px){.kandb-live-map-canvas{height:320px}.kandb-live-map-card{padding:10px}}
    `}</style>
  </section>;
}
