import { useSpace } from '../contexts/SpaceContext';
export default function useSpacePermissions() {
  const { activeSpace } = useSpace();
  return {
    canEdit: activeSpace?.isOwner === true || activeSpace?.canEdit === true,
    canDelete: activeSpace?.isOwner === true || activeSpace?.canDelete === true,
  };
}
