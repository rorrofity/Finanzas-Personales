/** Identity resolved by trusted authentication/membership middleware, never raw headers. */
const spaceReadOwner = req => req.spaceUserId || req.user?.id || req.actorId;
module.exports = { spaceReadOwner };
