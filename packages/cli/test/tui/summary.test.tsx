import { expect, it } from "vitest";
import { render } from "ink-testing-library";
import { Summary } from "../../src/tui/screens/Summary.js";

it("shows a pending estimate explicitly", () => {
  const { lastFrame, unmount } = render(<Summary previews={[]} matches={[]} matchWarnings={[]} scan={null} photos={[]} estimate={{ status: "pending" }} columns={100} rows={24} />);
  try { expect(lastFrame()).toContain("Estimated output: calculating…"); }
  finally { unmount(); }
});

it("renders a genuine zero byte estimate", () => {
  const { lastFrame, unmount } = render(<Summary previews={[]} matches={[]} matchWarnings={[]} scan={null} photos={[]} estimate={{ status: "ready", bytes: 0 }} columns={100} rows={24} />);
  try {
    expect(lastFrame()).toContain("Estimated output: 0 B");
  } finally {
    unmount();
  }
});

it("shows estimate failures without replacing the summary", () => {
  const { lastFrame, unmount } = render(<Summary previews={[]} matches={[]} matchWarnings={[]} scan={null} photos={[]} estimate={{ status: "failed", message: "Unable to estimate ZIP size." }} columns={100} rows={24} />);
  try {
    expect(lastFrame()).toContain("Unable to estimate ZIP size.");
    expect(lastFrame()).toContain("Enter to choose output path.");
  } finally { unmount(); }
});
