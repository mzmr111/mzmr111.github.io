"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CircleMarker, Map as LeafletMap, Polyline } from "leaflet";
import "leaflet/dist/leaflet.css";
import dataset from "./japan_places_map_data.json";

type Place = {
  id: string; name: string; prefecture: { ru: string; jp: string }; area: { ru: string; jp: string };
  category: string; tags: string[]; summary: string; interest: string;
  location: { lat: number; lng: number; nearestStation: string; stationWalkMin: number };
  access: { modes: string[]; carNeed: string; score: number; note: string };
  visit: { minutes: number; type: string; indoorOutdoor: string; seasonality: string; reservation: string; priceNote: string; hoursNote: string };
  cluster: { id: string; name: string }; research: { confidence: string; status: string };
  links: { googleMaps: string; officialOrSource: string };
};
type Route = { id: string; name: string; prefectures: string[]; durationMin: number; difficulty: number; transportModes: string[]; placeIds: string[]; suggestedOrder: string; withoutCar: boolean; note: string };
type Dataset = { places: Place[]; routes: Route[]; generatedAt: string };
type Filters = { prefecture: string; category: string; access: string; transport: string; duration: string; route: string; query: string };
const INITIAL: Filters = { prefecture: "", category: "", access: "", transport: "", duration: "", route: "", query: "" };

const categoryGroup = (category: string) => {
  if (/Музей|Наука|Библиотека|Книги/.test(category)) return "Музеи и культура";
  if (/Храм|святилище|История/.test(category)) return "Храмы и история";
  if (/Природа|парк|Пещера|Животные|Зоопарк/.test(category)) return "Природа и животные";
  if (/Архитектура|Руины|Улица|Транспорт|Фото/.test(category)) return "Архитектура и места";
  if (/Еда|Магазин|Онсэн|Отель/.test(category)) return "Еда, шопинг и отдых";
  return "Развлечения и другое";
};
const durationGroup = (minutes: number) => minutes <= 60 ? "short" : minutes <= 180 ? "half" : minutes <= 480 ? "day" : "trip";
const carGroup = (value: string) => ["easy", "possible"].includes(value) ? "transit" : ["helpful", "car_recommended"].includes(value) ? "car-helpful" : "car-needed";
const formatDuration = (minutes: number) => minutes < 60 ? `${minutes} мин` : minutes < 1440 ? `${Math.round(minutes / 6) / 10} ч` : `${Math.round(minutes / 1440)} дн`;
const modeLabel: Record<string, string> = { train: "поезд", subway: "метро", bus: "автобус", walk: "пешком", car: "машина", taxi: "такси", ferry: "паром", bicycle: "велосипед" };

function MapView({ allPlaces, places, selected, onSelect, activeRoute }: { allPlaces: Place[]; places: Place[]; selected: Place | null; onSelect: (p: Place) => void; activeRoute: Route | null }) {
  const el = useRef<HTMLDivElement>(null); const map = useRef<LeafletMap | null>(null);
  const markers = useRef<Map<string, CircleMarker>>(new Map()); const routeLine = useRef<Polyline | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void import("leaflet").then((L) => {
      if (!alive || !el.current || map.current) return;
      map.current = L.map(el.current, { zoomControl: false, preferCanvas: true, minZoom: 4 }).setView([37.4, 137.2], 5);
      L.control.zoom({ position: "bottomright" }).addTo(map.current);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 18 }).addTo(map.current);
      setReady(true);
    });
    return () => { alive = false; map.current?.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    if (!ready || !map.current) return;
    void import("leaflet").then((L) => {
      if (!map.current) return;
      markers.current.forEach((m) => m.remove()); markers.current.clear();
      const renderer = L.canvas({ padding: 0.5 });
      places.forEach((place) => {
        const marker = L.circleMarker([place.location.lat, place.location.lng], { renderer, radius: selected?.id === place.id ? 9 : 6, color: selected?.id === place.id ? "#fff" : "#12231d", weight: selected?.id === place.id ? 3 : 1.5, fillColor: selected?.id === place.id ? "#e65037" : "#d7ff5f", fillOpacity: 1 })
          .addTo(map.current!).on("click", () => onSelect(place));
        marker.bindTooltip(`<strong>${place.name}</strong><br>${place.prefecture.ru} · ${categoryGroup(place.category)}`, { direction: "top", offset: [0, -5] });
        markers.current.set(place.id, marker);
      });
      if (places.length && places.length < 80 && !selected && !activeRoute) map.current.fitBounds(L.latLngBounds(places.map((p) => [p.location.lat, p.location.lng])), { padding: [40, 40], maxZoom: 10 });
    });
  }, [ready, places, selected, onSelect, activeRoute]);
  useEffect(() => { if (selected && map.current) map.current.flyTo([selected.location.lat, selected.location.lng], Math.max(map.current.getZoom(), 10), { duration: 0.7 }); }, [selected]);
  useEffect(() => {
    if (!ready) return;
    void import("leaflet").then((L) => {
      routeLine.current?.remove(); routeLine.current = null;
      if (!activeRoute || !map.current) return;
      const lookup = new Map(allPlaces.map((p) => [p.id, p]));
      const points = activeRoute.placeIds.map((id) => lookup.get(id)).filter(Boolean) as Place[];
      if (points.length > 1) { routeLine.current = L.polyline(points.map((p) => [p.location.lat, p.location.lng]), { color: "#e65037", weight: 4, opacity: 0.85, dashArray: "8 8" }).addTo(map.current); map.current.fitBounds(routeLine.current.getBounds(), { padding: [60, 60], maxZoom: 11 }); }
    });
  }, [ready, activeRoute, allPlaces]);
  return <div ref={el} className="map" aria-label="Интерактивная карта мест Японии" />;
}

export default function Home() {
  const data = dataset as Dataset; const [filters, setFilters] = useState<Filters>(INITIAL);
  const [selected, setSelected] = useState<Place | null>(null); const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const p = new URLSearchParams(window.location.search);
      setFilters({ prefecture:p.get("pref")??"", category:p.get("cat")??"", access:p.get("access")??"", transport:p.get("transport")??"", duration:p.get("time")??"", route:p.get("route")??"", query:p.get("q")??"" });
    });
    return () => cancelAnimationFrame(id);
  }, []);
  const update = (key: keyof Filters, value: string) => { setFilters((f) => { const next={...f,[key]:value}; const p=new URLSearchParams(); Object.entries(next).forEach(([k,v])=>v&&p.set(({prefecture:"pref",category:"cat",duration:"time",query:"q"} as Record<string,string>)[k]??k,v)); history.replaceState(null,"",`${location.pathname}${p.size?`?${p}`:""}`); return next; }); setSelected(null); };
  const route = useMemo(() => data?.routes.find((r) => r.id === filters.route) ?? null, [data, filters.route]);
  const routePlaceIds = useMemo(() => new Set(route?.placeIds ?? []), [route]);
  const filtered = useMemo(() => data?.places.filter((p) => { const q=filters.query.toLowerCase().trim(); return (!filters.prefecture||p.prefecture.ru===filters.prefecture)&&(!filters.category||categoryGroup(p.category)===filters.category)&&(!filters.access||(filters.access.startsWith("score-")?p.access.score===Number(filters.access.at(-1)):carGroup(p.access.carNeed)===filters.access))&&(!filters.transport||p.access.modes.includes(filters.transport))&&(!filters.duration||durationGroup(p.visit.minutes)===filters.duration)&&(!filters.route||routePlaceIds.has(p.id))&&(!q||`${p.name} ${p.summary} ${p.tags.join(" ")} ${p.area.ru} ${p.area.jp}`.toLowerCase().includes(q)); })??[], [data,filters,routePlaceIds]);
  const prefectures=useMemo(()=>[...new Set(data?.places.map((p)=>p.prefecture.ru)??[])].sort((a,b)=>a.localeCompare(b,"ru")),[data]);
  const categories=useMemo(()=>[...new Set(data?.places.map((p)=>categoryGroup(p.category))??[])].sort(),[data]);
  const routes=useMemo(()=>data?.routes.filter((r)=>!filters.prefecture||r.prefectures.includes(filters.prefecture))??[],[data,filters.prefecture]);
  const activeCount=Object.values(filters).filter(Boolean).length;
  return <main className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">日</span><div><strong>Japan Places</strong><small>карта необычных мест</small></div></div><label className="search"><span>⌕</span><input value={filters.query} onChange={(e)=>update("query",e.target.value)} placeholder="Поиск по названию, тегу или городу"/></label><button className="mobile-filter" onClick={()=>setFiltersOpen(!filtersOpen)}>Фильтры {activeCount?<b>{activeCount}</b>:null}</button><div className="stat"><strong>{data.places.length}</strong><span>мест</span></div><div className="stat"><strong>{data.routes.length}</strong><span>маршрутов</span></div></header>
    <aside className={`sidebar ${filtersOpen?"open":""}`}><div className="sidebar-title"><div><span>НАСТРОИТЬ ПОЕЗДКУ</span><h1>Куда едем?</h1></div><button onClick={()=>setFiltersOpen(false)}>×</button></div>
      <Filter label="Префектура" value={filters.prefecture} onChange={(v)=>update("prefecture",v)} options={prefectures.map((x)=>[x,x])} empty="Вся Япония"/>
      <Filter label="Категория" value={filters.category} onChange={(v)=>update("category",v)} options={categories.map((x)=>[x,x])} empty="Все категории"/>
      <Filter label="Доступ" value={filters.access} onChange={(v)=>update("access",v)} options={[["transit","Легко без машины"],["car-helpful","Машина поможет"],["car-needed","Машина нужна"],...[1,2,3,4,5].map((n)=>[`score-${n}`,`Сложность ${n} / 5`])]} empty="Любая сложность"/>
      <Filter label="Транспорт" value={filters.transport} onChange={(v)=>update("transport",v)} options={[["train","Поезд"],["subway","Метро"],["bus","Автобус"],["walk","Пешком"],["car","Машина"],["taxi","Такси"],["ferry","Паром"]]} empty="Любой транспорт"/>
      <Filter label="Время на месте" value={filters.duration} onChange={(v)=>update("duration",v)} options={[["short","До 1 часа"],["half","1–3 часа"],["day","Полдня / день"],["trip","С ночёвкой"]]} empty="Любое время"/>
      <Filter label="Готовый маршрут" value={filters.route} onChange={(v)=>update("route",v)} options={routes.map((r)=>[r.id,`${r.name} · ${formatDuration(r.durationMin)}`])} empty="Без маршрута"/>
      {activeCount>0&&<button className="reset" onClick={()=>{setFilters(INITIAL);history.replaceState(null,"",location.pathname);setSelected(null)}}>Сбросить всё <span>↺</span></button>}
      <div className="source-note"><span>●</span><div><strong>Данные проверены</strong><small>Обновлено {new Date(data.generatedAt).toLocaleDateString("ru-RU")}</small></div></div>
    </aside>
    <section className="map-panel"><MapView allPlaces={data.places} places={filtered} selected={selected} onSelect={setSelected} activeRoute={route}/><div className="map-result"><strong>{filtered.length}</strong><span>{filtered.length===1?"место":"мест"} на карте</span></div>{route&&<div className="route-banner"><span>МАРШРУТ</span><strong>{route.name}</strong><small>{route.suggestedOrder}</small></div>}</section>
    <section className="results"><div className="results-head"><div><span>ПОДХОДЯЩИЕ МЕСТА</span><h2>{filtered.length} находок</h2></div><small>Нажмите, чтобы показать на карте</small></div><div className="cards">{filtered.slice(0,80).map((p)=><PlaceCard key={p.id} place={p} selected={selected?.id===p.id} onClick={()=>setSelected(p)}/>)}{!filtered.length&&<div className="empty"><b>Ничего не нашлось</b><span>Попробуйте ослабить один из фильтров.</span></div>}{filtered.length>80&&<div className="more">На карте показаны все точки. В списке — первые 80.</div>}</div></section>
    {selected&&<PlaceDrawer place={selected} onClose={()=>setSelected(null)}/>}</main>;
}
function Filter({label,value,onChange,options,empty}:{label:string;value:string;onChange:(v:string)=>void;options:string[][];empty:string}){return <label className="filter"><span>{label}</span><select value={value} onChange={(e)=>onChange(e.target.value)}><option value="">{empty}</option>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>}
function PlaceCard({place,selected,onClick}:{place:Place;selected:boolean;onClick:()=>void}){return <button className={`place-card ${selected?"selected":""}`} onClick={onClick}><div className="card-top"><span className="category-dot"/><span>{categoryGroup(place.category)}</span><b>{place.access.score}</b></div><h3>{place.name}</h3><p>{place.summary}</p><div className="card-meta"><span>⌖ {place.prefecture.ru} · {place.area.ru}</span><span>◷ {formatDuration(place.visit.minutes)}</span></div></button>}
function PlaceDrawer({place,onClose}:{place:Place;onClose:()=>void}){return <aside className="drawer"><button className="drawer-close" onClick={onClose} aria-label="Закрыть">×</button><span className="eyebrow">{categoryGroup(place.category)} · доступ {place.access.score}/5</span><h2>{place.name}</h2><div className="jp-name">{place.area.jp} · {place.prefecture.jp}</div><p className="lead">{place.interest}</p><div className="facts"><div><span>ВРЕМЯ</span><strong>{formatDuration(place.visit.minutes)}</strong></div><div><span>ОТ СТАНЦИИ</span><strong>{place.location.stationWalkMin} мин</strong></div><div><span>СРЕДА</span><strong>{{indoor:"внутри",outdoor:"снаружи",mixed:"смешанно"}[place.visit.indoorOutdoor]}</strong></div></div><div className="detail"><span>Как добраться</span><p>{place.access.note}</p><small>{place.access.modes.map((m)=>modeLabel[m]??m).join(" · ")}</small></div>{place.visit.hoursNote&&<div className="detail"><span>Часы и сезон</span><p>{place.visit.hoursNote}</p><small>{place.visit.seasonality}</small></div>}<div className="drawer-actions"><a href={place.links.googleMaps} target="_blank" rel="noreferrer">Открыть в Google Maps ↗</a><a className="secondary" href={place.links.officialOrSource} target="_blank" rel="noreferrer">Официальный сайт</a></div></aside>}
