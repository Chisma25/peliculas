import { expect, it } from "vitest";
import { toPublicUser } from "@/lib/public-user";

it("projects only display fields at the client boundary, even if internal fields are added", () => {
  const internal = {
    id: "member", name: "Member", username: "member", avatarSeed: "member", isAdmin: false,
    email: "private@example.invalid", passwordHash: "private-hash", recoveryCode: "private-code"
  };
  expect(toPublicUser(internal)).toEqual({
    id: "member", name: "Member", username: "member", avatarSeed: "member", isAdmin: false,
    avatarUrl: undefined
  });
});
