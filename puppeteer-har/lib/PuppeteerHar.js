const fs = require("fs");
const { promisify } = require("util");
const { harFromMessages } = require("../../chrome-har");

// event types to observe
const page_observe = [
	"Page.loadEventFired",
	"Page.domContentEventFired",
	"Page.frameStartedLoading",
	"Page.frameAttached",
	"Page.frameScheduledNavigation",
];

const network_observe = [
	"Network.requestWillBeSent",
	"Network.requestServedFromCache",
	"Network.dataReceived",
	"Network.responseReceived",
	"Network.resourceChangedPriority",
	"Network.loadingFinished",
	"Network.loadingFailed",
	"Network.getResponseBody",
];

class PuppeteerHar {
	/**
	 * @param {object} page
	 */
	constructor(page) {
		this.page = page;
		this.mainFrame = this.page.mainFrame();
		this.inProgress = false;
		this.cleanUp();
	}

	/**
	 * @returns {void}
	 */
	cleanUp() {
		this.network_events = [];
		this.page_events = [];
		this.response_body_promises = [];
	}

	/**
	 * @param {{path: string}=} options
	 * @return {Promise<void>}
	 */
	async start({ path, saveResponse, captureMimeTypes } = {}) {
		this.inProgress = true;
		this.saveResponse = saveResponse || false;
		this.captureMimeTypes = captureMimeTypes || [
			"text/html",
			"application/json",
		];
		this.path = path;
		this.client = await this.page.target().createCDPSession();
		await this.client.send("Page.enable");
		await this.client.send("Network.enable");
		// biome-ignore lint/complexity/noForEach: <explanation>
		page_observe.forEach((method) => {
			this.client.on(method, (params) => {
				if (!this.inProgress) {
					return;
				}
				this.page_events.push({ method, params });
			});
		});

		// biome-ignore lint/complexity/noForEach: <explanation>
		network_observe.forEach((method) => {
			this.client.on(method, (params) => {
				if (!this.inProgress) {
					return;
				}
				this.network_events.push({ method, params });

				if (
					method === "Network.responseReceived" ||
					method === "Network.loadingFinished"
				) {
					// const response = params.response;
					const requestId = params.requestId;

					// Response body is unavailable for redirects, no-content, image, audio and video responses

					const promise = this.client
						.send("Network.getResponseBody", { requestId })
						.then(
							(responseBody) => {
								console.log(requestId, method, responseBody?.body.slice(0, 20));

								if (responseBody?.body?.length) {
									params.response = {...(params.response || {})}
									if (responseBody.base64Encoded) {
										params.response.encoding = "base64";
									}
									params.response.body = responseBody.body;
									
									// crude override
									const eventIndex = this.network_events.findIndex(event=>event.params.requestId === requestId)
									this.network_events[eventIndex].params.response = params.response;
									// console.log(this.network_events[eventIndex]);
									// console.log(eventRef);
								}
								// if (response.mimeType.includes("image")) {
								// } else {
								// 	params.response.body = new Buffer.from(
								// 		responseBody.body,
								// 		responseBody.base64Encoded ? "base64" : undefined,
								// 	).toString();
								// }
							},
							(reason) => {
								// console.log({ requestId, reason });
								// Resources (i.e. response bodies) are flushed after page commits
								// navigation and we are no longer able to retrieve them. In this
								// case, fail soft so we still add the rest of the response to the
								// HAR. Possible option would be force wait before navigation...
							},
						)
						.catch((e) => {
							// console.log({e})
							//
						});
					this.response_body_promises.push(promise);
				}
			});
		});
	}

	/**
	 * @returns {Promise<void|object>}
	 */
	async stop() {
		this.inProgress = false;
		await Promise.all(this.response_body_promises);
		await this.client.detach();
		const har = harFromMessages(this.page_events.concat(this.network_events), {
			includeTextFromResponseBody: true,
		});
		this.cleanUp();
		if (this.path) {
			await promisify(fs.writeFile)(this.path, JSON.stringify(har, null, 2));
		} else {
			return har;
		}
	}
}

module.exports = PuppeteerHar;
