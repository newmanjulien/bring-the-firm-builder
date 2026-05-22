import { createVercelBuilderHandler } from '@overbase/builder-sdk/vercel';
import app from '../../src/server.js';

export const config = {
	api: {
		bodyParser: false
	}
};

export default createVercelBuilderHandler(app.fetch);
