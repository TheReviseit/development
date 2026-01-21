"""
Production-grade favicon generator for Flowauxi
Creates all required favicon sizes with transparent backgrounds from the base logo.png
"""

from PIL import Image
import os

# Paths
PUBLIC_DIR = r"c:\Users\Sugan001\Desktop\Flowauxi\frontend\public"
BASE_LOGO = os.path.join(PUBLIC_DIR, "logo.png")

def ensure_transparent_background(img):
    """Ensure the image has a transparent background"""
    # Convert to RGBA if not already
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # Get the data
    data = img.getdata()
    
    # For images with light backgrounds, convert near-white pixels to transparent
    new_data = []
    for item in data:
        # If pixel is very light (close to white/light gray), make it transparent
        if item[0] > 240 and item[1] > 240 and item[2] > 240:
            new_data.append((255, 255, 255, 0))  # Fully transparent
        else:
            new_data.append(item)
    
    img.putdata(new_data)
    return img

def create_favicon(base_img, size, output_path, add_padding=True):
    """Create a favicon at the specified size with optional padding"""
    # Calculate size with padding (10% margin on each side)
    if add_padding:
        content_size = int(size * 0.8)  # 80% of total size
        padding = (size - content_size) // 2
    else:
        content_size = size
        padding = 0
    
    # Resize the base image to content size
    resized = base_img.resize((content_size, content_size), Image.Resampling.LANCZOS)
    
    # Create a new transparent image at full size
    result = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    
    # Paste the resized image at the center
    result.paste(resized, (padding, padding), resized)
    
    # Save the result
    result.save(output_path, 'PNG', optimize=True)
    print(f"✓ Created: {os.path.basename(output_path)} ({size}x{size})")

def create_ico_file(base_img, output_path):
    """Create a multi-resolution .ico file"""
    sizes = [(16, 16), (32, 32), (48, 48)]
    images = []
    
    for size in sizes:
        # Create each size with minimal padding for .ico
        content_size = int(size[0] * 0.9)
        padding = (size[0] - content_size) // 2
        
        resized = base_img.resize((content_size, content_size), Image.Resampling.LANCZOS)
        result = Image.new('RGBA', size, (0, 0, 0, 0))
        result.paste(resized, (padding, padding), resized)
        images.append(result)
    
    # Save as .ico with all sizes
    images[0].save(output_path, format='ICO', sizes=sizes, append_images=images[1:])
    print(f"✓ Created: {os.path.basename(output_path)} (multi-resolution: 16x16, 32x32, 48x48)")

def main():
    print("🎨 Flowauxi Favicon Generator")
    print("=" * 50)
    
    # Load the base logo
    print(f"\n📂 Loading base logo: {BASE_LOGO}")
    if not os.path.exists(BASE_LOGO):
        print(f"❌ Error: Base logo not found at {BASE_LOGO}")
        return False
    
    base_logo = Image.open(BASE_LOGO)
    
    # Ensure transparent background
    print("🔄 Processing transparent background...")
    base_logo = ensure_transparent_background(base_logo)
    
    print("\n📦 Generating favicon files...")
    
    # Create 16x16 favicon
    create_favicon(base_logo, 16, os.path.join(PUBLIC_DIR, "favicon-16x16.png"), add_padding=False)
    
    # Create 32x32 favicon
    create_favicon(base_logo, 32, os.path.join(PUBLIC_DIR, "favicon-32x32.png"), add_padding=False)
    
    # Create 48x48 favicon
    create_favicon(base_logo, 48, os.path.join(PUBLIC_DIR, "favicon-48x48.png"), add_padding=False)
    
    # Create multi-resolution .ico file
    create_ico_file(base_logo, os.path.join(PUBLIC_DIR, "favicon.ico"))
    
    # Create 192x192 icon with padding
    create_favicon(base_logo, 192, os.path.join(PUBLIC_DIR, "icon-192.png"), add_padding=True)
    
    # Create 512x512 icon with padding
    create_favicon(base_logo, 512, os.path.join(PUBLIC_DIR, "icon-512.png"), add_padding=True)
    
    # Replace logo.png with transparent version
    base_logo.save(os.path.join(PUBLIC_DIR, "logo.png"), 'PNG', optimize=True)
    print(f"✓ Updated: logo.png (512x512 with transparent background)")
    
    # Also copy to app directory for Next.js convention
    app_dir = r"c:\Users\Sugan001\Desktop\Flowauxi\frontend\app"
    base_logo.save(os.path.join(app_dir, "favicon.ico"), format='ICO', sizes=[(48, 48)])
    print(f"✓ Updated: app/favicon.ico")
    
    print("\n✅ All favicon files generated successfully!")
    print("\n📋 Generated files:")
    print("   • favicon-16x16.png")
    print("   • favicon-32x32.png")
    print("   • favicon-48x48.png")
    print("   • favicon.ico (multi-resolution)")
    print("   • icon-192.png")
    print("   • icon-512.png")
    print("   • logo.png (transparent)")
    print("   • app/favicon.ico")
    
    return True

if __name__ == "__main__":
    try:
        success = main()
        if not success:
            exit(1)
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        exit(1)
