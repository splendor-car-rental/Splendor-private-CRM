import { TelematicsPing, TelematicsAlert, GeofenceZone, Vehicle, Contract } from '../types/index.js';

export class TelematicsEngine {
  public static readonly SUPERCAR_CRITICAL_SPEED_LIMIT = 200; // km/h
  public static readonly STANDARD_WARNING_SPEED_LIMIT = 160; // km/h

  public static readonly DEFAULT_GEOFENCE_ZONES: GeofenceZone[] = [
    {
      id: 'ZONE-UAE-BORDER',
      name: 'UAE Sovereign Borders Envelope',
      nameAr: 'نطاق الحدود السيادية لدولة الإمارات',
      zoneType: 'uae_national_border',
      // Simplified bounding box / envelope of UAE mainland
      coordinates: [
        { lat: 26.15, lng: 55.80 },
        { lat: 25.40, lng: 56.40 },
        { lat: 24.20, lng: 55.90 },
        { lat: 22.60, lng: 55.20 },
        { lat: 23.90, lng: 52.00 },
        { lat: 24.50, lng: 51.50 },
        { lat: 25.30, lng: 55.00 },
        { lat: 26.15, lng: 55.80 }
      ],
      isRestricted: false
    },
    {
      id: 'ZONE-PROHIBITED-DESERT-DUNES',
      name: 'Al Qudra / Lahbab Deep Desert Dunes (Off-Road Prohibited for Supercars)',
      nameAr: 'كثبان القدرة واللهباب الصحراوية (ممنوع القيادة الوعرة للسوبركار)',
      zoneType: 'prohibited_desert_offroad',
      coordinates: [
        { lat: 24.85, lng: 55.35 },
        { lat: 24.95, lng: 55.55 },
        { lat: 24.75, lng: 55.65 },
        { lat: 24.65, lng: 55.45 }
      ],
      isRestricted: true,
      penaltyAmountAed: 5000 // 5,000 AED unauthorized off-road penalty
    }
  ];

  /**
   * Ray-casting algorithm to test if a point (lat, lng) is inside a polygon
   */
  public static isPointInPolygon(point: { lat: number; lng: number }, polygon: Array<{ lat: number; lng: number }>): boolean {
    if (polygon.length < 3) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lng, yi = polygon[i].lat;
      const xj = polygon[j].lng, yj = polygon[j].lat;

      const intersect = ((yi > point.lat) !== (yj > point.lat)) &&
        (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Ingest and evaluate a single telematics ping from a vehicle tracker
   */
  public static evaluatePing(
    ping: TelematicsPing,
    vehicle: Vehicle,
    activeContract?: Contract,
    geofenceZones: GeofenceZone[] = this.DEFAULT_GEOFENCE_ZONES
  ): TelematicsAlert[] {
    const alerts: TelematicsAlert[] = [];
    const now = ping.timestamp || new Date().toISOString();
    const point = { lat: ping.latitude, lng: ping.longitude };

    // 1. Check Overspeed Violation
    const isSupercar = vehicle.category === 'supercar';
    if (ping.speedKmh >= this.SUPERCAR_CRITICAL_SPEED_LIMIT) {
      alerts.push({
        id: `ALT-${Math.floor(100000 + Math.random() * 900000)}`,
        vehicleId: vehicle.id,
        contractId: activeContract?.id,
        customerId: activeContract?.customerId,
        severity: 'CRITICAL',
        type: 'OVERSPEED_200',
        title: `Critical Speed Violation (${ping.speedKmh} km/h)`,
        titleAr: `تجاوز خطير للسرعة القصوى (${ping.speedKmh} كم/س)`,
        description: `Vehicle ${vehicle.make} ${vehicle.model} clocked at ${ping.speedKmh} km/h exceeding 200 km/h safety barrier.`,
        speedKmh: ping.speedKmh,
        latitude: ping.latitude,
        longitude: ping.longitude,
        timestamp: now,
        acknowledged: false
      });
    } else if (ping.speedKmh >= this.STANDARD_WARNING_SPEED_LIMIT) {
      alerts.push({
        id: `ALT-${Math.floor(100000 + Math.random() * 900000)}`,
        vehicleId: vehicle.id,
        contractId: activeContract?.id,
        customerId: activeContract?.customerId,
        severity: 'WARNING',
        type: 'HARSH_ACCELERATION',
        title: `High Speed Warning (${ping.speedKmh} km/h)`,
        titleAr: `تحذير سرعة عالية (${ping.speedKmh} كم/س)`,
        description: `Vehicle observed cruising at ${ping.speedKmh} km/h.`,
        speedKmh: ping.speedKmh,
        latitude: ping.latitude,
        longitude: ping.longitude,
        timestamp: now,
        acknowledged: false
      });
    }

    // 2. Geofence & Prohibited Zone Checks
    for (const zone of geofenceZones) {
      const isInside = this.isPointInPolygon(point, zone.coordinates);

      if (zone.zoneType === 'prohibited_desert_offroad' && isInside) {
        alerts.push({
          id: `ALT-${Math.floor(100000 + Math.random() * 900000)}`,
          vehicleId: vehicle.id,
          contractId: activeContract?.id,
          customerId: activeContract?.customerId,
          severity: 'CRITICAL',
          type: 'OFFROAD_DESERT_DETECTED',
          title: `Restricted Desert Off-Road Entry: ${zone.name}`,
          titleAr: `دخول منطقة صحراوية محظورة: ${zone.nameAr || zone.name}`,
          description: `Telemetry detected vehicle inside restricted sand dune off-road zone. Fine liability: AED ${zone.penaltyAmountAed || 5000}.`,
          latitude: ping.latitude,
          longitude: ping.longitude,
          timestamp: now,
          acknowledged: false
        });
      }

      if (zone.zoneType === 'uae_national_border' && !isInside) {
        alerts.push({
          id: `ALT-${Math.floor(100000 + Math.random() * 900000)}`,
          vehicleId: vehicle.id,
          contractId: activeContract?.id,
          customerId: activeContract?.customerId,
          severity: 'CRITICAL',
          type: 'BORDER_EXIT_ATTEMPT',
          title: 'UAE Border Exit Envelope Breach',
          titleAr: 'محاولة خروج عن الحدود السيادية للإمارات',
          description: `Vehicle coordinates (${ping.latitude}, ${ping.longitude}) indicate departure outside UAE territory. Immediate concierge security intervention required.`,
          latitude: ping.latitude,
          longitude: ping.longitude,
          timestamp: now,
          acknowledged: false
        });
      }
    }

    return alerts;
  }
}
