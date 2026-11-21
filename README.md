# Driving in Soest 3D

An open-world 3D driving game set in Soest (Utrecht), built with Three.js.
It is a remake of [leonardran/driving-in-soest](https://github.com/leonardran/driving-in-soest),
the original 2D SVG game — same town, same taxi premise, but a real 3D world
with streets you can drive, traffic, people, police and a day/night cycle.

No build step, no dependencies to install: open `index.html`, or run the app
here and it is served straight from disk.

## Playing

- **Taxi carrière** — passengers hail you, you pick them up and drop them off.
  Fares, tips and a rating; speeding through corners costs you the tip.
- **Vrij rijden** — the whole town, every car, no clock. Use the phone to pick
  a vehicle, drop a waypoint on the map and navigate there.

### Controls

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` / arrows | drive |
| `Shift` | boost |
| `Space` | handbrake |
| `E` | get in / out of the car |
| `C` | camera: chase, bonnet, far |
| `M` | phone map |
| `P` | phone |
| `R` | next radio station |
| `H` | horn |
| `N` | jump three hours ahead |
| `Esc` | pause / close the phone |

## What is in the box

- **The town** — the street grid of the original game turned into a road graph
  in metres: crossings, kerbs, cycle lanes, zebra crossings, street lamps,
  driveways, garden fences, wheelie bins, bikes, benches and bus stops.
- **Landmarks** — Oude Kerk with its tower, Molen De Windhond with turning
  sails, the water tower, Paleis Soestdijk, three stations, the shopping
  centre, the garage and the emergency services.
- **Cars** — lofted hulls with glass, pillars, wheel arches, chrome, plates and
  emissive lights. Taxi, compact, estate, van, GTI, classic, police, ambulance
  and fire engine, all with their own handling.
- **Physics** — a bicycle model with grip-limited lateral scrub, weight
  transfer, handbrake slides, and circle-vs-box collision with the city.
- **Life** — AI traffic that queues and turns, parked cars along every kerb,
  pedestrians and cyclists, police that chase you when you misbehave.
- **Navigation** — A* over the road graph, turn-by-turn instructions, blue
  chevrons painted on the road, and a rotating radar minimap.
- **Time** — a full day/night cycle: sun path, sky gradient, stars, lamp glow,
  lit windows and headlights.
- **Sound** — procedural engine, tyre scrub, sirens, horn and UI sounds, plus
  the radio stations from the original game with jingles and talk segments
  between tracks.

## Credits

Original 2D game, its radio audio and the map of Soest: **leonardran**.
3D remake: a fan project. Built with [Three.js](https://threejs.org/).
