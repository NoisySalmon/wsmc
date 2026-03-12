Hi!  Here we have somewhat of a disaster of a spreadsheet.

- `2026 Region 5 WSMC Regional Scoring.xlsx`

This is a tool to score a regional math contest.

Participating schools are Division 1 or Division 2

Schools bring high school students, from 9th to 12th grade.

They then form teams, of up to 3 students who must be different grade levels.

- students may "play up" - a 9th grader can play as a 11th grade, for example.  This enables teams with students of grades 12, 9, and 9, for example.  A 1-person team is also valid.

Students compete on the following contests:

- Team Contest, where teams work on a set of problems for an hour.
- Team Project, where teams may submit a prior bit of work which is scored separately.  
  - At the competition, they present their project and judges score the presentation aspect.
  - The total score (prior work + presentation aspect) is submitted after the contest.
- Topical Contests
  - These are two parts, 30 minutes each.  Part 1 and Part 2
  - Students may take them as teams OR individuals
- Knowdown
  - An elimination-based contest of mental arithmetic.  Schools elect 3 individuals to compete.



## Webapp

Let's rebuild this as a webapp.  To start, let's imagine the critical flows:

- entering participants for a school, including team formation and knowdown participants1
- recording scores for the schools
  - coaches score them by hand, and then someone enters the results
- viewing leaderboards and identifying the winners (who qualify for state)