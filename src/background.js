chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "open-options-page") {
        chrome.runtime.openOptionsPage().catch(console.error);
    }
});