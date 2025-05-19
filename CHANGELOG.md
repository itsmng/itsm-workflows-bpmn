# Change Log
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

<!---
your comment goes here
and here
## [Unreleased]
### Added

### Changed
-->
## Release 2.3.1
- Release to match bpmn-server Release 2.3.1
- added Workflow animation in InstanceDetails page
- added Show Tokens in InstanceDetails page
- Modified configuration.ts to support 
	saveLogs
	saveSource
	MongoDB collections names

## Release 2.2.19
- Release to match bpmn-server Release 2.2.19
- Fixed bug #244 
- Fixed bugs in ending flow #242
## Release 2.2.18
- Release to match bpmn-server Release 2.2.18
- Show itemKey in display
## Release 2.2.13
- Change configuration to match new Release
## Release 2.2.4
- Fix api dataStore/findInstances(query,projection)
## Release 2.2.3
- Clean up UI for security 
- Improve UI for model docs
- Moved test processes to separate folder 'src/test/processes'
- Added test scenarios
## Release 2.1.10 
- Minor change to Modeler UI: allow resizable property panel from the left side
- Added more test sceanrio
- Moved docs to github.io
## Release 2.1.5 -- 2024-03
- Added engine.startEvent to API
### Enhanced cli
- support double quotes, so parameters like: `name "Buy Used Car" ` can now work
- support backspace on input

## Release 2.1.0 -- 2024-03
- Added engine.restart

## Release 2.0.1 -- 2024-02
- Moved webApp as a separate Repo (this repo)
- New Folder structure
- src to include typescripts only, dist to include js
- Repo to include src only
- Moved routes,scripts,views under src
- Moved configuration.ts , appDelegate, appSercies under src/WorkflowApp
- .env : added port #
- .env : expanded for security
- New Installation procedure
- Use npm run setup (twice)
- cli: use npm run cli
- New API is called by api2
- UI: instance details , added Model docs
- UI: invoke item form now supports Date type
- app.ts: remove security, email to UserService class


