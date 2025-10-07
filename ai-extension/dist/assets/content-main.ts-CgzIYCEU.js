(function(){console.info("AI Pocket content script initialized"),chrome.runtime.onMessage.addListener((e,n,t)=>(console.debug("Content script received message",{message:e,sender:n}),t({ok:!0}),!1));
})()
