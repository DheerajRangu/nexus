# Scenario video sources

Real stock footage is downloaded for local AEGIS testing from Pexels under the [Pexels license](https://www.pexels.com/license/). These clips contain no generated AEGIS detection overlays or prefilled road states.

| Local file | Creator | Source |
| --- | --- | --- |
| `highway-traffic.mp4` | Cade Gallagher | https://www.pexels.com/video/cars-on-highway-1171461/ |
| `scenario-city-traffic.mp4` | Amanat Ali Warraich | https://www.pexels.com/video/a-traffic-jam-on-a-busy-street-with-many-cars-20770166/ |
| `scenario-construction.mp4` | 8 K | https://www.pexels.com/video/road-construction-4430419/ |
| `scenario-rainy-night.mp4` | Athena Sandrini | https://www.pexels.com/video/vehicles-traveling-on-a-rainy-night-3588017/ |

| `scenario-road-block.mp4` | Brayds Channel | https://www.pexels.com/video/road-closed-sign-7297442/ |
| `scenario-accident-aftermath.mp4` | CityXcape | https://www.pexels.com/video/a-wrecked-car-on-the-street-3974558/ |

Downloaded renditions:

- https://videos.pexels.com/video-files/4430419/4430419-hd_1280_720_24fps.mp4
- https://videos.pexels.com/video-files/20770166/20770166-hd_720_1280_30fps.mp4
- https://videos.pexels.com/video-files/3588017/3588017-hd_1280_720_24fps.mp4

- https://videos.pexels.com/video-files/7297442/7297442-hd_1920_1080_30fps.mp4
- https://videos.pexels.com/video-files/3974558/3974558-hd_1280_720_30fps.mp4

The wrecked-car clip shows accident aftermath. It does not show the impact, converging trajectories or pre-impact braking.

## Synthetic control fixtures

`fixture-stop-and-resume.mp4` and `fixture-camera-shake.mp4` are derived from Cade Gallagher's highway sample. They are edited control fixtures, not footage of real accidents, braking or camera instability.

- Stop/resume: first five seconds of real footage, the next frame repeated for ten seconds, then five seconds of resumed source footage. Frames are resized to 640 × 360 and encoded as H.264.
- Camera shake: first twelve seconds of source footage resized to 640 × 360, with deterministic oscillating translation/rotation and slight zoom. Reflection fills image boundaries.

The original footage's source/license applies to these derivatives. See `scenarios.json` for verified durations, dimensions, frame rates and decoded frame counts.
