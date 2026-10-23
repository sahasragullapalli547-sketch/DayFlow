# Amazon Developer Hackathon submission checklist

This checklist is based on the supplied `Amazon-hackathon.txt` brief. Code alone does not complete the Devpost submission.

## Track selection

- **Primary track (recommended based on this code): Alexa+ — simulated web experience.** The supplied brief permits a simulated Alexa+ experience in a web app and says there is no specific framework/SDK requirement for that path. Clearly disclose that this is a simulation, not a live Alexa+ integration.
- **Mini challenge (optional): AWS Builder.** DayFlow includes an optional Amazon Bedrock provider in `server/src/llm.js`. It only counts as an actual working integration after you configure AWS access and demonstrate a successful live call. Document the AWS service and integration in your feedback.

## Required submission items

- [ ] Project description: explain the productivity problem, how DayFlow interprets requests, reviews bulk task extraction, schedules tasks, and validates actions server-side.
- [ ] GitHub repository containing source, assets, setup instructions, and the open-source license.
- [ ] Repository visibility/access: if public, verify the repository is genuinely open source; if private, share it with `testing@devpost.com` and the Amazon reviewers named in the supplied brief, then verify invitations.
- [ ] Demo video: public YouTube/Vimeo link, in English, under 3 minutes. Show the app actually running; lead with the strongest working workflow. Do not use unlicensed music/footage or third-party trademarks without permission.
- [ ] Select Alexa+ as the primary track if this remains the intended entry, and AWS Builder only if Bedrock is live-tested.
- [ ] Product feedback for every tool/API/SDK used, including what it did, what worked, what needs improvement, onboarding, and whether you would build with it again. Be factual.
- [ ] If the project existed before the hackathon, explain precisely what was built/changed during the submission window.
- [ ] Optional feature requests and friction log: include task, steps, expected vs. actual result, severity, workaround, and actionable suggestion to support any potential bonus.

## Recommended demo flow (under 3 minutes)

1. Open the running DayFlow UI and introduce it as an Alexa+-inspired simulated productivity assistant.
2. Enter a natural-language request containing several tasks and a deadline.
3. Show the review-before-save batch panel and edit one field.
4. Confirm the import and show tasks persisted in the task list.
5. Generate a clock-based schedule, highlighting breaks and unscheduled-task warnings.
6. Complete a task and refresh to demonstrate persistence.
7. If entering AWS Builder, show one successful Bedrock-backed request and the configuration/status without exposing secrets. If not live-tested, do not claim it works.

## Final gate

Do not submit until `npm ci`, `npm test`, `npm run build`, `npm start`, the main UI flow, and any claimed live AI provider have been verified on the actual deployment environment. Attach the actual repository and demo URLs; never invent them.
