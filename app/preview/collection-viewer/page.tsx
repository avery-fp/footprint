import PublicPage from '@/app/[slug]/PublicPage'
import { getTheme } from '@/lib/themes'
import {
  COLLECTION_VIEWER_FIXTURE_CONTAINER_ID,
  collectionViewerFixtureChildren,
} from '@/lib/collection-viewer-fixture'

const roomId = 'fixture-room'

const containerTile = {
  id: COLLECTION_VIEWER_FIXTURE_CONTAINER_ID,
  url: 'container://do-not-enter',
  type: 'container',
  title: 'Do Not Enter',
  description: null,
  thumbnail_url: null,
  embed_html: null,
  position: 0,
  room_id: roomId,
  size: 1,
  aspect: 'square',
  container_label: 'Do Not Enter',
  container_cover_url: null,
  parent_tile_id: null,
  source: 'links' as const,
}

export default function CollectionViewerFixturePage() {
  return (
    <PublicPage
      footprint={{
        username: 'preview',
        display_title: 'viewer fixture',
        display_name: 'viewer fixture',
        dimension: 'midnight',
        serial_number: 1001,
        user_id: null,
      }}
      content={[containerTile]}
      rooms={[{
        id: roomId,
        name: 'world',
        layout: 'grid',
        is_locked: false,
        has_passcode: false,
        content: [containerTile],
      }]}
      theme={getTheme('midnight')}
      serial=""
      pageUrl="http://localhost/preview/collection-viewer"
      containerMeta={{
        [COLLECTION_VIEWER_FIXTURE_CONTAINER_ID]: {
          childCount: collectionViewerFixtureChildren.length,
          firstThumb: null,
        },
      }}
      ownerEmail={null}
      isDraft={false}
      isOwnerHinted={false}
      wantsEditOverlay={false}
    />
  )
}
