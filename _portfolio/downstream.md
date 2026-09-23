---
title: "Downstream: a diffuse pollution game"
excerpt: "A browser game in which you walk a procedurally generated catchment and repair it, guided by the SCIMAP risk model running live on the terrain."
collection: portfolio
---

<video controls playsinline preload="metadata" poster="https://simreaney.github.io/downstream/media/trailer-poster.jpg" style="width: 100%; height: auto; border-radius: 8px;" aria-label="Downstream gameplay trailer">
  <source src="https://simreaney.github.io/downstream/media/trailer.mp4" type="video/mp4">
  <a href="https://simreaney.github.io/downstream/media/trailer.mp4">Download the trailer (MP4)</a>
</video>

**[Play Downstream in your browser](https://simreaney.github.io/downstream/play/)** · [Project page](https://simreaney.github.io/downstream/) · [Source on GitHub](https://github.com/simreaney/downstream)

Downstream is a third-person game about diffuse pollution. Each catchment is generated from a seed, with ridges, valleys, a river network, fields, woods, a village and a fishery downstream. It is losing soil to its river. The player walks the landscape and repairs it by planting riparian trees, digging offline ponds and building leaky wooden dams.

The risk map the player works from is [SCIMAP](/portfolio/scimap/), running live in the browser on the generated terrain and re-solving every time something is built. Bright ground on the map is both erodible and hydrologically connected to a watercourse, which is where fine sediment comes from. The source risk, connectivity, erosion and in-channel risk layers can all be viewed in the game.

![The SCIMAP source-risk layer over the catchment](https://simreaney.github.io/downstream/media/risk-960.jpg)

Each tool acts on a different part of the model. Planting changes the land-cover weighting of the source term. Ponds and leaky dams break the connection between a source area and the channel, which caps the Network Index for everything upslope. The siting rules follow practice: leaky dams go in low-order headwater reaches and ponds go in hollows off the channel, and the game explains why a site is refused. The land-cover weights are used as they are, even where they are counter-intuitive. For example, planting trees on rough grazing slightly increases modelled erosion, and the game allows it and says so.

![Lining up a leaky dam on a headwater stream](https://simreaney.github.io/downstream/media/dam-960.jpg)

The player's work can be tested against a 1-in-30 design storm, routed through the catchment by a lag-and-route flood model. The resulting hydrograph compares the flood peak with the interventions against the same storm without them. Smaller storms, sampled from the same Gumbel distribution, also arrive on their own.

![The flood hydrograph after a design storm](https://simreaney.github.io/downstream/media/result-960.jpg)

Generation is exactly reproducible, so a saved game is only a seed plus a list of interventions: a few hundred bytes, small enough to share as a link. For teaching, `?seed=` gives a whole class the same landscape to work on. The model code follows the reference SCIMAP implementation, with three deliberate departures that are documented in the [design notes](https://github.com/simreaney/downstream/blob/main/DESIGN.md).
