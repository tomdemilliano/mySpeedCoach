# Rope Skipping AI Analysis Skill

This skill file provides domain knowledge for the AI coach analysis in MySpeedCoach.
It is injected into the system prompt of `/api/ai-analysis` calls.

---

## Discipline Reference

### Speed Sprint — Single Rope Speed Sprint (SRSS)
**Duration:** 30 seconds  
**Scoring:** Steps counted on one foot (so multiply ×2 for full jumps)  
**World Record:** 119 steps (≈ 238 jumps in 30s — roughly 8 jumps/second)  
**Sport analogy:** Like the 100m sprint in athletics — pure explosive speed, maximal effort from start to finish. Every tenth of a second counts.

**Benchmarks (steps in 30s — one foot):**
| Level | Steps |
|---|---|
| Beginner | < 40 |
| Club | 40–59 |
| Regional | 60–74 |
| National | 75–94 |
| International | 95–109 |
| World class | 110–119 |

**Coaching focus:** Cadence consistency, ankle stiffness, minimal ground contact time, arm drive symmetry. A strong sprint has a fast start, no deceleration in the final 10 seconds, and a steady rhythm — unlike many beginners who start fast then fade. BPM typically peaks at 85–95% of max heart rate due to the short duration; if BPM is unusually low, the effort may not have been maximal.

---

### Endurance 2 min — Single Rope Speed Endurance (SRSE 2×30s or 1×120s)
**Duration:** 120 seconds  
**Scoring:** Steps on one foot over the full duration  
**World Record (1×120s):** ~389 steps  
**Sport analogy:** Similar to the 400m or 800m in athletics — a balance between speed and endurance. Athletes must pace strategically; going out too fast leads to a collapse in the final 30 seconds.

**Benchmarks (steps in 120s):**
| Level | Steps |
|---|---|
| Beginner | < 80 |
| Club | 80–139 |
| Regional | 140–199 |
| National | 200–269 |
| International | 270–350 |
| World class | 350+ |

**Coaching focus:** Pacing strategy (even splits vs. negative split), lactate tolerance, breathing rhythm. BPM should climb steadily — a good performance typically reaches 88–96% of max HR by the end. Analyse the tempo per phase (first 30s, middle 60s, final 30s) to detect pacing errors.

---

### Endurance 3 min — Single Rope Speed Endurance (SRSE 1×180s)
**Duration:** 180 seconds  
**Scoring:** Steps on one foot over the full duration  
**World Record:** 584 steps  
**Sport analogy:** Comparable to the 1500m or mile in athletics — a gruelling test of sustained speed under fatigue. Mental toughness and aerobic capacity are as important as technical skill.

**Benchmarks (steps in 180s):**
| Level | Steps |
|---|---|
| Beginner | < 120 |
| Club | 120–199 |
| Regional | 200–299 |
| National | 300–420 |
| International | 420–530 |
| World class | 530–584 |

**Coaching focus:** Aerobic base, lactate threshold, pacing discipline. Athletes should aim for consistent 30-second splits; a drop of >10% in the final minute signals insufficient aerobic fitness or poor pacing. BPM in a well-executed 3-min endurance effort should reach 90–98% of max HR.

---

### Triple Under — Single Rope Triple Unders (SRTU)
**Duration:** Untimed (max consecutive count)  
**Scoring:** Number of consecutive successful triple-under jumps (rope passes 3× per jump)  
**World Record:** 560 consecutive triple unders  
**Sport analogy:** Like gymnastics or figure skating — a skill-based discipline requiring extreme precision, timing, and coordination. Even getting one is an achievement for most athletes.

**Benchmarks (consecutive triples):**
| Level | Count |
|---|---|
| Beginner | 1–5 |
| Club | 5–19 |
| Regional | 20–49 |
| National | 50–150 |
| International | 150–400 |
| World class | 400–560 |

**Coaching focus:** Jump height, rope speed, wrist mechanics, consistent take-off rhythm. Triple unders require the rope to spin ~3× faster than a regular jump. Common errors: insufficient jump height, inconsistent wrist snap, looking down. A miss at a high count is often caused by fatigue-induced drift in jump height rather than wrist failure.

---

### Speed Relay 4×30 — Single Rope Speed Relay (SRSR 4×30s)
**Duration:** 4 × 30 seconds (each of 4 team members jumps once)  
**Scoring:** Total steps across all 4 athletes  
**World Record:** ~450 total steps  
**Sport analogy:** Like a 4×100m relay in athletics — team coordination, transition speed (the "baton change"), and individual sprint performance all matter.

**Benchmarks (total steps, 4 athletes):**
| Level | Steps |
|---|---|
| Club | 160–249 |
| Regional | 250–329 |
| National | 330–399 |
| World class | 400–450 |

**Coaching focus:** Consistent individual contributions, fast transitions (under 1 second), ordering by fatigue resistance (strongest closer last). Uneven splits between team members indicate a training imbalance.

---

### Double Under — Double Unders Relay (SRDR 2×30s)
**Duration:** 2 × 30 seconds (2 athletes, each jumping once)  
**Scoring:** Total steps (each step = one double-under jump, rope passes 2× per jump)  
**World Record:** 190 total steps  
**Sport analogy:** Like a 200m relay — shorter but still a team effort requiring both athletes to perform at a high level.

**Benchmarks (total steps, 2 athletes):**
| Level | Steps |
|---|---|
| Club | 40–89 |
| Regional | 90–139 |
| National | 140–169 |
| World class | 170–190 |

**Coaching focus:** Double-under technique (tight rope arc, explosive wrist snap, consistent jump height), consistent rhythm between attempts.

---

### DD Speed Sprint — Double Dutch Speed Sprint (DDSS 1×60s)
**Duration:** 60 seconds  
**Scoring:** Steps of the jumper (1 turner + 1 jumper + 1 turner configuration)  
**World Record:** ~130 steps in 60s  
**Sport analogy:** Like a 200m hurdles — technical complexity layered on top of pure speed. The jumper must read two rotating ropes and maintain rhythm with turners.

**Benchmarks (jumper steps in 60s):**
| Level | Steps |
|---|---|
| Club | 25–59 |
| Regional | 60–89 |
| National | 90–110 |
| World class | 111–130 |

**Coaching focus:** Turner synchronisation, jumper entry timing, maintaining consistent rope arc under fatigue. Turner consistency is often the limiting factor — assess whether BPM and tempo charts show disruptions (which often indicate turner errors rather than jumper fatigue).

---

### DD Speed Relay — Double Dutch Speed Relay (DDSR 4×30s)
**Duration:** 4 × 30 seconds (4 team rotations)  
**Scoring:** Total steps across all rotations  
**World Record:** 416 total steps  
**Sport analogy:** Like a 4×400m relay — sustained high output across multiple team members with a complex skill layer.

**Benchmarks (total steps):**
| Level | Steps |
|---|---|
| Club | 120–219 |
| Regional | 220–299 |
| National | 300–370 |
| World class | 371–416 |

---

### Freestyle
**Duration:** Typically 60–75 seconds for competitions  
**Scoring:** Judged on difficulty, execution, and presentation (not step count)  
**Note:** When a step count is saved for freestyle, treat it as a training drill metric rather than a competitive score. Do not compare to speed disciplines.

---

## General Coaching Principles

### Heart Rate Interpretation
- **< 75% max HR** during a sprint discipline: likely submaximal effort — encourage more intensity
- **75–85% max HR**: moderate effort, appropriate for endurance training
- **85–95% max HR**: high intensity, appropriate for competitive simulation
- **> 95% max HR**: near-maximal effort — excellent for short sprint intervals, unsustainable for endurance
- **Estimated max HR** (if unknown): use 220 − age, but note this is a rough estimate

### Phase Analysis (for timed disciplines)
Split the session into three equal time segments and compare:
- **Tempo drop > 15% from phase 1 to phase 3**: significant fatigue, likely aerobic limitation or poor pacing
- **Steady tempo across all phases**: excellent pacing control
- **Accelerating tempo (negative split)**: ideal in endurance, rare but highly efficient

### Common Errors by Discipline
- **Sprint**: Going out too fast and dying in the last 10s; inconsistent rope length causing catch-up steps
- **Endurance**: Positive split (too fast start), hyperventilation in final phase
- **Triple Under**: Losing jump height consistency after 20+ consecutive; shoulder fatigue causing rope arc collapse
- **Double Dutch**: Turner fatigue causing rope arc irregularity; jumper losing entry rhythm

### Language and Tone
- Responses must be in **Dutch**
- Be specific and actionable — avoid generic phrases like "train harder"
- Reference the athlete's actual numbers (score, BPM, phases) in the feedback
- Keep the total response under 300 words
- Structure: 1) Prestatiebeoordeling 2) Fase-analyse 3) Verbeterpunten 4) 2 concrete oefeningen 5) Prioriteit volgende sessie
