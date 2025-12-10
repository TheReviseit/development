import Link from "next/link";

export default function NotFound() {
  return (
    <section className="min-h-screen w-full flex items-center justify-center bg-white overflow-hidden">
      <div className="w-full max-w-4xl mx-auto px-4">
        <div className="text-center">
          {/* 404 Animation Background */}
          <div
            className="relative w-full h-[350px] md:h-[450px] bg-center bg-no-repeat flex items-center justify-center mb-6"
            style={{
              backgroundImage:
                "url(https://cdn.dribbble.com/users/285475/screenshots/2083086/dribbble_1.gif)",
              backgroundSize: "cover",
            }}
          >
            <h1 className="text-7xl md:text-9xl font-bold text-gray-800 drop-shadow-lg">
              404
            </h1>
          </div>

          {/* Error Message */}
          <div className="mt-4">
            <h3 className="text-2xl md:text-4xl font-semibold text-gray-800 mb-3">
              Looks like you&apos;re lost
            </h3>

            <p className="text-base md:text-lg text-gray-600 mb-6">
              The page you are looking for is not available!
            </p>

            <Link
              href="/"
              className="inline-block bg-black hover:bg-black/80 text-white font-medium text-base !px-6 !py-3 !w-auto rounded-lg transition duration-200 shadow-md hover:shadow-lg"
            >
              Go to Home
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
