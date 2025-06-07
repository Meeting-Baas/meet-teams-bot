import { RecordingMode } from '../api';
// export async function removeInitialShityHtml(mode: RecordingMode) {
//     // Fonction désactivée temporairement pour tests
//     console.log('removeInitialShityHtml désactivé');
//     return;
// }
// export function removeShityHtml(mode: RecordingMode) {
//     // Fonction désactivée temporairement pour tests
//     console.log('removeShityHtml désactivé');
//     return;
// }


export async function removeInitialShityHtml(mode: RecordingMode) {
    let div
    try {
        document.querySelectorAll('[data-purpose="non-essential-ui"]').forEach(
            elem => (elem as HTMLElement).style.display = 'none'
        );
    } catch (e) {}
    try {
        for (div of document.getElementsByTagName('div')) {
            if (div.clientWidth === 360 && div.clientHeight === 326) {
                div.style.display = 'none'
            }
        }
    } catch (e) {}
    try {
        for (div of document.getElementsByTagName('div')) {
            if (div.clientHeight === 26) {
                div.style.display = 'none'
            }
        }
    } catch (e) {}
    try {
        const bannerDiv = document.querySelector(
            'div[role="banner"]',
        ) as HTMLElement
        if (bannerDiv) {
            bannerDiv.style.opacity = '0'
        }
    } catch (e) {
        // console.error('Error with banner div:', e)
    }
    try {
        for (div of document.getElementsByTagName('div')) {
            if (div.clientHeight === 20) {
                div.style.display = 'none'
            }
        }
    } catch (e) {}
    try {
        let span
        for (span of document.getElementsByTagName('span')) {
            if (span.innerText.includes(':')) {
                span.parentElement.parentElement.style.display = 'none'
            }
        }
    } catch (e) {}
    try {
        removeBlackBox()
    } catch (e) {
        // console.error('Error with removeBlackBox:', e)
    }
    try {
        const politeDivs = document.querySelectorAll('div[aria-live="polite"]')
        politeDivs.forEach((div) => {
            ;(div as HTMLElement).style.opacity = '0'
        })
    } catch (e) {
        // console.error('Error setting opacity for aria-live="polite" divs:', e)
    }

    // People panel shitty HTML remove
    let root: any = null
    while (root == null) {
        root = (Array as any)
            .from(document.querySelectorAll('div'))
            .find((d) => d.innerText === 'People')?.parentElement?.parentElement
        if (root != null) {
            try {
                root.parentElement.style.opacity = 0
                root.parentElement.parentElement.style.opacity = 0
                const rootLeft = (Array as any)
                    .from(document.querySelectorAll('div'))
                    .find((d) => d.innerText === 'You')
                rootLeft.parentElement.parentElement.parentElement.parentElement.style.width =
                    '97vw'
            } catch (e) {
                // console.error(
                //     '[getSpeakerRootToObserve] on meet error finding You',
                //     e,
                // )
            }
        }
    }

    if (mode !== 'gallery_view') {
        try {
            const video = document.getElementsByTagName(
                'video',
            )[0] as HTMLVideoElement
            if (video) {
                video.style.position = 'fixed'
                video.style.display = 'block'
                video.style.left = '0'
                video.style.top = '0'
                video.style.zIndex = '900000'
                if (video?.parentElement?.style) {
                    video.parentElement.style.background = '#000'
                    video.parentElement.style.top = '0'
                    video.parentElement.style.left = '0'
                    video.parentElement.style.width = '100vw'
                    video.parentElement.style.height = '100vh'
                    video.parentElement.style.position = 'fixed'
                    video.parentElement.style.display = 'flex'
                    video.parentElement.style.alignItems = 'center'
                    video.parentElement.style.justifyContent = 'center'
                }
            }
        } catch (e) {}
    }
}



export function removeShityHtml(mode: RecordingMode) {
    // '#a8c7fa'
    if (mode !== 'gallery_view') {
        try {
            const video = document.getElementsByTagName(
                'video',
            )[0] as HTMLVideoElement
            if (video) {
                video.style.position = 'fixed'
                video.style.display = 'block'
                video.style.left = '0'
                video.style.top = '0'
                video.style.zIndex = '1'
                if (video?.parentElement?.style) {
                    video.parentElement.style.background = '#000'
                    video.parentElement.style.top = '0'
                    video.parentElement.style.left = '0'
                    video.parentElement.style.width = '100vw'
                    video.parentElement.style.height = '100vh'
                    video.parentElement.style.position = 'fixed'
                    video.parentElement.style.display = 'flex'
                    video.parentElement.style.alignItems = 'center'
                    video.parentElement.style.justifyContent = 'center'
                }
            }
        } catch (e) {
            // console.error('Error with video setup:', e)
        }

        try {
            document.getElementsByTagName('video')[1].style.position = 'fixed'
        } catch (e) {
            // console.error('Error with second video:', e)
        }
        try {
            removeBlackBox()
        } catch (e) {
            // console.error('Error with removeBlackBox:', e)
        }
    }

    try {
        const bannerDiv = document.querySelector(
            'div[role="banner"]',
        ) as HTMLElement
        if (bannerDiv) {
            bannerDiv.style.opacity = '0'
        }
    } catch (e) {
        // console.error('Error with banner div:', e)
    }
    try {
        for (const div of document.getElementsByTagName('div')) {
            if (div.clientHeight === 164 && div.clientWidth === 322) {
                div.style.display = 'none'
            }
        }
    } catch (e) {}
    try {
        for (const div of document.getElementsByTagName('div')) {
            if (div.clientHeight === 40) {
                div.style.opacity = '0'
            }
        }
    } catch (e) {}
    try {
        const politeDivs = document.querySelectorAll('div[aria-live="polite"]')
        politeDivs.forEach((div) => {
            ;(div as HTMLElement).style.opacity = '0'
        })
    } catch (e) {
        // console.error('Error setting opacity for aria-live="polite" divs:', e)
    }
    try {
        var icons = Array.from(
            document.querySelectorAll('i.google-material-icons'),
        ).filter((el) => el.textContent?.trim() === 'devices')
        icons.forEach((icon) => {
            // Change the opacity of the parent element to 0
            if (icon.parentElement) {
                icon.parentElement.style.opacity = '0'
            }
        })
    } catch (e) {
        // console.error('Error applying opacity:', e)
    }

    // People panel shitty HTML remove
    let root: any = null
    while (root == null) {
        root = (Array as any)
            .from(document.querySelectorAll('div'))
            .find((d) => d.innerText === 'People')?.parentElement?.parentElement
        if (root != null) {
            try {
                root.parentElement.style.opacity = 0
                root.parentElement.parentElement.style.opacity = 0
                const rootLeft = (Array as any)
                    .from(document.querySelectorAll('div'))
                    .find((d) => d.innerText === 'You')
                rootLeft.parentElement.parentElement.parentElement.parentElement.style.width =
                    '97vw'
            } catch (e) {
                // console.error(
                //     '[getSpeakerRootToObserve] on meet error finding You',
                //     e,
                // )
            }
        }
    }

    // Add opacity change for 'mood' icons with specific parent background
    try {
        var moodIcons = Array.from(
            document.querySelectorAll('i.google-material-icons'),
        ).filter((el) => el.textContent?.trim() === 'mood')
        if (moodIcons.length > 0) {
            var icon = moodIcons[0]
            var currentElement = icon.parentElement
            while (currentElement != null) {
                var bgColor =
                    window.getComputedStyle(currentElement).backgroundColor
                if (bgColor === 'rgb(32, 33, 36)') {
                    currentElement.style.opacity = '0'
                    break
                }
                currentElement = currentElement.parentElement
            }
        } else {
            // console.log("No 'mood' icon found.")
        }
    } catch (e) {
        // console.error("Error finding 'mood' icon:", e)
    }
}

function removeBlackBox(): void {
    // Sélectionner tous les éléments avec l'attribut data-layout='roi-crop'
    const elements: NodeListOf<HTMLElement> = document.querySelectorAll(
        '[data-layout="roi-crop"]',
    )

    if (elements.length === 0) {
        // console.log("Aucun élément trouvé avec data-layout='roi-crop'")
        return
    }

    // Trouver l'élément avec la plus grande largeur
    let maxWidth: number = 0
    let maxElement: HTMLElement | null = null

    elements.forEach((el: HTMLElement) => {
        const width: number = el.offsetWidth
        if (width > maxWidth) {
            maxWidth = width
            maxElement = el
        }
    })

    // Appliquer les styles aux autres éléments et leurs parents
    elements.forEach((el: HTMLElement) => {
        if (el == maxElement) {
            el.style.opacity = '1'
            el.style.top = '0'
            el.style.left = '0'
            el.style.position = 'fixed'
            el.style.zIndex = '9000'
            el.style.backgroundColor = 'black'
        } else {
            applyStylesRecursively(el, 4)
        }
    })
}

function applyStylesRecursively(
    element: HTMLElement | null,
    depth: number,
): void {
    if (depth < 0 || !element) return

    element.style.opacity = '0'
    element.style.border = 'transparent'

    applyStylesRecursively(element.parentElement, depth - 1)
}

function applyStyles(mode: RecordingMode, doc = document) {
    try {
        // Find the main video using more stable criteria
        const mainVideo = findMainVideo(doc);
        
        if (mainVideo) {
            styleMainVideo(mainVideo, mode);
        } else {
            console.warn('No main video found to style');
        }
        
        // Hide UI elements regardless of class names
        hideInterfaceElements(doc);
        
    } catch (e) {
        console.error('Error applying styles:', e);
    }
}

function findMainVideo(doc: Document): HTMLVideoElement | null {
    // Try multiple strategies to find the main video element
    
    // Strategy 1: Find video elements with autoplay attribute
    const autoplayVideos = Array.from(doc.querySelectorAll('video[autoplay]'));
    
    // If we find autoplay videos, prioritize by size
    if (autoplayVideos.length > 0) {
        // Sort by area (width × height) to find the largest video
        return autoplayVideos.sort((a, b) => {
            const areaA = a.clientWidth * a.clientHeight;
            const areaB = b.clientWidth * b.clientHeight;
            return areaB - areaA; // Descending order (largest first)
        })[0] as HTMLVideoElement;
    }
    
    // Strategy 2: Look for video elements with specific attributes common in Meet
    const videoCandidates = Array.from(doc.querySelectorAll('video[playsinline]'));
    if (videoCandidates.length > 0) {
        return videoCandidates.sort((a, b) => {
            const areaA = a.clientWidth * a.clientHeight;
            const areaB = b.clientWidth * b.clientHeight;
            return areaB - areaA;
        })[0] as HTMLVideoElement;
    }
    
    // Strategy 3: Last resort - just get the largest video element
    const allVideos = Array.from(doc.querySelectorAll('video'));
    if (allVideos.length > 0) {
        return allVideos.sort((a, b) => {
            const areaA = a.clientWidth * a.clientHeight;
            const areaB = b.clientWidth * b.clientHeight;
            return areaB - areaA;
        })[0] as HTMLVideoElement;
    }
    
    return null;
}

function styleMainVideo(video: HTMLVideoElement, mode: RecordingMode): void {
    // Style the video
    video.style.position = 'fixed';
    video.style.display = 'block';
    video.style.left = '0';
    video.style.top = '0';
    video.style.width = '100vw';
    video.style.height = '100vh';
    video.style.objectFit = 'contain';
    video.style.zIndex = '900000';
    video.style.backgroundColor = '#000';
    
    // Try to style parent container too (up to 3 levels)
    let parent = video.parentElement;
    let level = 0;
    
    while (parent && level < 3) {
        parent.style.position = 'fixed';
        parent.style.left = '0';
        parent.style.top = '0';
        parent.style.width = '100vw';
        parent.style.height = '100vh';
        parent.style.overflow = 'hidden';
        parent.style.zIndex = '899999';
        
        // Move up one level
        parent = parent.parentElement;
        level++;
    }
}

function hideInterfaceElements(doc: Document): void {
    // Hide elements by role (more stable than class names)
    const rolesToHide = ['banner', 'toolbar', 'complementary', 'navigation'];
    rolesToHide.forEach(role => {
        doc.querySelectorAll(`[role="${role}"]`).forEach(
            elem => (elem as HTMLElement).style.opacity = '0'
        );
    });
    
    // Hide polite announcements
    doc.querySelectorAll('div[aria-live="polite"]').forEach(
        div => (div as HTMLElement).style.opacity = '0'
    );
    
    // Hide buttons
    doc.querySelectorAll('button').forEach(button => {
        // Only hide buttons that are not essential
        // We can further refine this logic if needed
        if (!button.hasAttribute('data-essential')) {
            button.style.opacity = '0';
        }
    });
    
    // Hide notification areas typically at the bottom
    const bottomElements = Array.from(doc.querySelectorAll('div'))
        .filter(div => {
            const rect = div.getBoundingClientRect();
            // Elements at the bottom of the screen
            return rect.bottom > window.innerHeight - 150 && 
                   rect.height < 150 && 
                   rect.width > 200;
        });
    
    bottomElements.forEach(el => {
        (el as HTMLElement).style.opacity = '0';
    });
}

function observeIframes(callback: (iframe: HTMLIFrameElement) => void) {
    // Process existing iframes
    document.querySelectorAll('iframe').forEach(iframe => {
        callback(iframe);
    });
    
    // Watch for new iframes
    const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeName === 'IFRAME') {
                    callback(node as HTMLIFrameElement);
                }
                
                // Also check for iframes inside added nodes
                if (node.nodeType === Node.ELEMENT_NODE) {
                    (node as Element).querySelectorAll('iframe').forEach(iframe => {
                        callback(iframe);
                    });
                }
            });
        });
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    return observer;
}

function getIframeDocument(iframe: HTMLIFrameElement): Document | null {
    try {
        return iframe.contentDocument || iframe.contentWindow?.document || null;
    } catch (error) {
        console.log('Cannot access iframe content (likely cross-origin):', error);
        return null;
    }
}
