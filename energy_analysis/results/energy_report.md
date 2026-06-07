# Energy & Carbon Footprint of the Penumbra Pipeline

## Methodology
Energy use was measured with **CodeCarbon 3.2.7**, which estimates
processor energy from the detected CPU's power profile and converts it to CO₂-equivalent
using the regional grid carbon intensity. Each stage was executed for at least
3 s of wall-clock time and repeated 2 times; we report the
mean ± standard deviation of per-item latency and energy. The chatbot's LLM runs on a
third-party API (OpenAI/Groq) and is therefore reported as a literature-based estimate
of 0.3 Wh per reply rather than a local measurement.

**Hardware/software:** 12th Gen Intel(R) Core(TM) i5-12450H (12 logical cores), detected CPU
power 7.69 W; RAM 15.71 GB; OS Windows-11-10.0.26200-SP0;
Python 3.12.0. **Grid:** India
(0.71344 kgCO₂/kWh).

*Limitation:* on Windows, Intel RAPL counters are unavailable, so CPU energy is modelled
from the CPU's TDP rather than read from hardware sensors; treat values as credible
estimates, not meter readings.

## Per-operation results (mean ± std)
| Operation | Latency | Energy |
|---|---|---|
| MentalBERT classification (1 post) | 57.4 ± 10.6 ms | 0.62503 ± 0.19749 mWh |
| Embedding (1 text, all-MiniLM-L6-v2) | 22.7 ± 1.4 ms | 0.14647 ± 0.00117 mWh |
| Model load (once per boot) | 2179 ms | 18.259 mWh |

## Aggregate / "energy to obtain a result"
| Task | Energy | CO₂e |
|---|---|---|
| 1,000 classifications | 0.6250 Wh | 0.4459 g |
| Profile one user (50 posts: classify + embed) | 0.03857 Wh | 0.02752 g |
| One chatbot reply (embedding + LLM estimate) | 0.3001 Wh | 0.2141 g |

## Takeaways
- On-device inference (classification + embeddings) is in the **sub-milliwatt-hour** range
  per item — its carbon footprint is negligible.
- The **LLM reply dominates** the chatbot's energy and occurs off-device on a third-party API.
- Reproduce with: `python energy_analysis/measure_energy.py --reps 2 --seconds 3 --country IND`
