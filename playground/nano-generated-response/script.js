// script.js

document.addEventListener('DOMContentLoaded', () => {
    const heroButton = document.querySelector('#hero button');

    heroButton.addEventListener('click', () => {
        alert('You clicked the Shop Now button!');
        // Add more actions here, like redirecting to a shop page
    });

    // Optional: Add subtle animations on scroll
    window.addEventListener('scroll', () => {
        // Example: Fade in elements as they come into view
        const elements = document.querySelectorAll('[data-animation]');
        elements.forEach(element => {
            const animationType = element.dataset.animation;
            if (animationType === 'fade-in') {
                if (element.offsetTop < window.innerHeight) {
                    element.classList.add('fade-in');
                }
            }
        });
    });
});