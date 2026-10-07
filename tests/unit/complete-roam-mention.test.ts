import { describe, expect, it } from "vitest";
import { completeRoamMention } from "@/features/group-chat/domain/message";

describe("completeRoamMention", () => {
  it("turns a half-typed mention plus a space into @Roam and a space", () => {
    expect(completeRoamMention("@r", "@r ")).toBe("@Roam ");
    expect(completeRoamMention("@RO", "@RO ")).toBe("@Roam ");
    expect(completeRoamMention("hey @roam", "hey @roam ")).toBe("hey @Roam ");
  });

  it("leaves everything else alone", () => {
    expect(completeRoamMention("@", "@ ")).toBe("@ ");
    expect(completeRoamMention("@robert", "@robert ")).toBe("@robert ");
    expect(completeRoamMention("r", "r ")).toBe("r ");
    expect(completeRoamMention("email me@r", "email me@r ")).toBe("email me@r ");
    expect(completeRoamMention("@r", "@ro")).toBe("@ro");
    expect(completeRoamMention("", " ")).toBe(" ");
  });
});
