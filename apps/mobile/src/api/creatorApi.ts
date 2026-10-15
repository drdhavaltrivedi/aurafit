import { api } from './index';
import { createCreatorApi, type CreatorApi } from './creator';

/** Creator endpoints bound to the app's API client; `null` in demo mode. */
export const creatorApi: CreatorApi | null = api ? createCreatorApi(api) : null;
