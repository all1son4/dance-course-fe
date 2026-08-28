import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { pickMessages } from "./client-messages";

const messages = {
  Common: { details: "Details", closeDialog: "Close" },
  FirstTouchPage: {
    hero: { title: "Hero" },
    signupDialog: { title: "Sign up", fields: { email: { label: "Email" } } },
  },
  FAQ: { title: "FAQ" },
};

describe("pickMessages", () => {
  it("picks whole namespaces", () => {
    assert.deepEqual(pickMessages(messages, ["Common", "FAQ"]), {
      Common: messages.Common,
      FAQ: messages.FAQ,
    });
  });

  it("picks dotted sub-trees without their siblings", () => {
    assert.deepEqual(pickMessages(messages, ["FirstTouchPage.signupDialog"]), {
      FirstTouchPage: { signupDialog: messages.FirstTouchPage.signupDialog },
    });
  });

  it("merges several paths under one namespace and ignores unknown ones", () => {
    assert.deepEqual(
      pickMessages(messages, [
        "FirstTouchPage.hero",
        "FirstTouchPage.signupDialog",
        "Nope.x",
      ]),
      { FirstTouchPage: messages.FirstTouchPage },
    );
  });
});
