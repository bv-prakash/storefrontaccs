# Home Slider

The Home Slider block creates a responsive image and content slider. It supports navigation dots, arrows, and an infinite auto-loop.

## Block Configuration

You can enable or disable different features of the slider by adding the following block classes:

- **arrows** (or **arrow**): Enables left and right navigation arrows.
- **dots** (or **dot**): Enables navigation dots at the bottom of the slider.
- **loop** (or **infinite**): Enables an infinite auto-loop that automatically advances slides every 5 seconds.

*Example block name: `Home Slider (arrows, dots, loop)`*

## Content Structure

Each row in the block represents a single slide.
Each slide should have **two columns**:
1. **Column 1 (Image)**: The background image or picture for the slide.
2. **Column 2 (Content)**: The textual content and call-to-action for the slide.

### Expected Content Format (Column 2)

Within the second column (Content), the block expects the following elements in order:

- **Heading (H1 - H6)**: The main title of the slide.
- **Paragraph 1**: Used as the location or subtitle text.
- **Paragraph 2**: Used as the main description text.
- **Button/Link (or Paragraph 3)**: A call-to-action link or button.

## Example Authoring Document

| Home Slider (arrows, dots, loop) | |
| --- | --- |
| ![Slide 1 Image](image1.jpg) | <h2>Discover New Horizons</h2><p>Paris, France</p><p>Experience the beauty and culture of the most romantic city in the world.</p><p><a href="/explore">Explore Now</a></p> |
| ![Slide 2 Image](image2.jpg) | <h2>Adventure Awaits</h2><p>Swiss Alps</p><p>Join us for an unforgettable skiing experience this winter season.</p><p><a href="/book">Book Today</a></p> |
