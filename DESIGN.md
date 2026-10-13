# Plan-Jump Deluxe — game design

## Core loop

Jump, dodge, deploy late, and land safely. Solo rewards the fastest safe descent. Local two-player races are first to two wins. Each flight begins with a three-second launch window; controls become active for each jumper immediately, independently of the opponent.

## Physics and resolution

- Simulation: a fixed 120 Hz step, independent of display refresh rate.
- World: 1,000 units wide; ground at 3,000; starting height 125.
- Freefall: gravity 510 units/s², terminal velocity 370 units/s.
- Steering: 380 units/s for keyboard, touch, and camera; hard lane boundaries.
- Safe deployment line: world Y 2,550, shown as 150 metres above ground.
- Canopy: 0.34-second inflation, slowing to 108 units/s.
- A deployment below the line visibly opens but cannot make the landing safe.
- Hazard collision or a missed launch loses the round. First safe landing wins.
- All outcomes in one simulation step resolve together. Both crashes or both safe landings draw. A safe landing beats a simultaneous crash.

Results never depend on which player's collision is processed first. Physics stops on pause and round completion; restarting clears held input.

## Courses and difficulty

Cruise has seven hazards and no wind. Rush has nine hazards, moving balloons/drones, and light wind. Storm has eleven hazards and stronger wind. Edge hazards prevent one safe wall from becoming the whole strategy.

Obstacle layouts use a seeded generator. Both racers share the same normalized course, obstacle phase, and wind. Duo courses change between scored rounds, while a drawn round keeps its course. Each solo difficulty always uses the same seed, so personal bests compare the same challenge.

## Controls and replay

Solo: Space to jump/deploy and arrows to steer. Duo: W/A/D for Player 1 and arrows for Player 2. Touch buttons mirror those actions. P or Escape pauses; R restarts; M toggles sound. A best-of-three scoreboard remains between race rounds and resets for a new match.

Solo records retain five times for each difficulty/input board. Failed and demonstration flights do not enter records. Optional hand steering has the same speed limit as other controls, with its own record board.

## Presentation

A cream flight-club shell, navy flight deck, lime actions, pale-blue sky, lavender accents, and the original illustrated diver create a consistent aviation theme. The interface uses semantic HTML around a Canvas 2D renderer. Separate cameras keep both racers visible. Altitude, flight state, timer, controls, and result dialogs are HTML and remain readable on narrow screens.

Reduced motion removes ambient bobbing, banking, rotor animation, and speed streaks. Essential descent remains visible. Sound is off by default; a single toggle enables music and generated action effects.

## Camera lifecycle

Hand steering requires explicit opt-in. The stream is mirrored locally and inference runs in a worker at up to 15 samples/second. A generation token invalidates pending permission/model/playback work. Late permission results stop their tracks immediately. Pause, restart, menu, tab hiding, and page exit stop the current stream and terminate the worker. Camera failure leaves keyboard and touch controls available.

## Demo and delivery

The autoplay demo uses the same physics and collision rules as the player, with a pilot that chooses nearby safe paths and deploys above the safe line. GitHub Pages serves the complete playable game. Relative paths make the build portable to a repository subdirectory. Node's built-in tools handle tests and static packaging; ordinary gameplay needs no external runtime.
