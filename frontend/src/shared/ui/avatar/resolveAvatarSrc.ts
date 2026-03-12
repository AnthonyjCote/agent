type AvatarResolverOperator = {
  id: string;
  name: string;
  sourceAgentId?: string | null;
  avatarDataUrl?: string;
};

type AvatarResolverManifest = {
  agentId: string;
  avatarDataUrl?: string;
};

type ResolveAvatarSrcInput = {
  explicitAvatarSrc?: string;
  operatorId?: string;
  name?: string;
  operators: AvatarResolverOperator[];
  manifests: AvatarResolverManifest[];
};

export function resolveAvatarSrc({
  explicitAvatarSrc,
  operatorId,
  name,
  operators,
  manifests
}: ResolveAvatarSrcInput): string | undefined {
  if (explicitAvatarSrc && explicitAvatarSrc.trim().length > 0) {
    return explicitAvatarSrc;
  }

  const manifestById = new Map(manifests.map((manifest) => [manifest.agentId, manifest]));
  const normalizedName = (name || '').trim().toLowerCase();

  const matchById = operatorId ? operators.find((operator) => operator.id === operatorId) : undefined;
  const matchByName =
    !matchById && normalizedName
      ? operators.find((operator) => operator.name.trim().toLowerCase() === normalizedName)
      : undefined;
  const match = matchById || matchByName;
  if (!match) {
    return undefined;
  }

  if (match.sourceAgentId) {
    const manifestAvatar = manifestById.get(match.sourceAgentId)?.avatarDataUrl;
    if (manifestAvatar && manifestAvatar.trim().length > 0) {
      return manifestAvatar;
    }
  }

  if (match.avatarDataUrl && match.avatarDataUrl.trim().length > 0) {
    return match.avatarDataUrl;
  }

  return undefined;
}
