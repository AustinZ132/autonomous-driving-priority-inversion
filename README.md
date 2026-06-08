# Priority Inversion Lab

Interactive static simulator for the RTOS priority inversion presentation.

## What it shows

- CPU timeline by discrete scheduler ticks.
- Ready queue and blocked queue movement.
- Lock S ownership for the LiDAR data mutex.
- Deadline result for Task H: AEB.
- Side-by-side comparison of no priority inheritance and priority inheritance.

## Vercel deployment

Use these settings when importing the repository into Vercel:

- Application Preset: `Other`
- Root Directory: `Project/priority-inversion-lab`
- Build Command: leave empty
- Output Directory: `.`
- Install Command: leave empty

This project is plain HTML, CSS, and JavaScript, so Vercel can serve it as a static site without a build step.
