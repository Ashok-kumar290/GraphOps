import { beforeEach } from "vitest";

// Pages are addressed by URL fragment; every test starts on the homepage.
beforeEach(() => history.replaceState(null, "", "/"));
