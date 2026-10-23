import { useEffect, useRef, useState } from "react";
import { Marker } from "react-leaflet";
import L, { LatLngExpression, Marker as LeafletMarker, latLng } from "leaflet";

// object array voor de props van de PlaneMarker component
type PlaneMarkerProps = {
  id: string;
  position: LatLngExpression;
  icon: L.Icon | L.DivIcon;
  popup?: React.ReactNode;
  open?: boolean; // gekozen in de lijst: popup meteen openen
};

// lineaire interpolatie functie voor soepele animatie
const lerp = (start: number, end: number, t: number) =>
  start + (end - start) * t;

const PlaneMarker = ({ id, position, icon, popup, open }: PlaneMarkerProps) => {
  const markerRef = useRef<LeafletMarker | null>(null);
  const animationRef = useRef<number | null>(null);
  const targetPosition = useRef<LatLngExpression>(position);
  // alleen de beginpositie gaat via react, daarna schuift leaflet de marker zelf.
  // anders rendert elke marker elk beeldje opnieuw, en bij duizenden vliegtuigen wordt dat traag
  const [currentPosition] = useState<LatLngExpression>(position);

  //! effect voor smooth animatie van vliegtuig marker met interpolatie
  useEffect(() => {
    targetPosition.current = position;

    if (!markerRef.current) return;

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    const animate = () => {
      if (!markerRef.current) return;

      const currentLatLng = markerRef.current.getLatLng();
      const targetLatLng = latLng(targetPosition.current);

      const lat = lerp(currentLatLng.lat, targetLatLng.lat, 0.1);
      const lng = lerp(currentLatLng.lng, targetLatLng.lng, 0.1);

      const newLatLng = latLng(lat, lng);
      markerRef.current.setLatLng(newLatLng);

      if (currentLatLng.distanceTo(targetLatLng) > 0.0001) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };
    // Start de animatie
    animationRef.current = requestAnimationFrame(animate);
    // cleanup functie om de animatie te stoppen bij unmount
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [position]);

  //! popup openen als dit vliegtuig in de lijst gekozen is
  useEffect(() => {
    if (open) markerRef.current?.openPopup();
  }, [open]);

  //! marker component met interpolatie animatie wordt gerenderd
  return (
    <Marker
      position={currentPosition}
      icon={icon}
      ref={(ref) => {
        if (ref) markerRef.current = ref;
      }}
    >
      {popup}
    </Marker>
  );
};

export default PlaneMarker;
