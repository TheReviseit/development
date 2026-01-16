"use client";

import { useState, useEffect } from "react";
import "./CustomerReviews.css";

interface Review {
  id: number;
  name: string;
  role: string;
  company: string;
  avatar: string;
  rating: number;
  review: string;
  category: string;
}

const reviews: Review[] = [
  {
    id: 1,
    name: "Sarah Johnson",
    role: "Support Manager",
    company: "TechCorp",
    avatar: "from-purple-400 to-pink-400",
    rating: 4.9,
    review:
      "Flowauxi cut our response time by 70%. The AI handles routine questions perfectly, and our team can focus on complex issues.",
    category: "Customer Support",
  },
  {
    id: 2,
    name: "Michael Chen",
    role: "Sales Director",
    company: "SalesHub",
    avatar: "from-blue-400 to-cyan-400",
    rating: 5.0,
    review:
      "Our conversion rate increased 45% in the first month. The smart broadcasts and CRM integration are game-changers.",
    category: "Sales",
  },
  {
    id: 3,
    name: "Emily Rodriguez",
    role: "Marketing Lead",
    company: "StartupXYZ",
    avatar: "from-green-400 to-emerald-400",
    rating: 4.8,
    review:
      "Finally, a WhatsApp tool that actually understands marketing. The segmentation and automation features are excellent.",
    category: "Marketing",
  },
  {
    id: 4,
    name: "David Kumar",
    role: "Customer Success Manager",
    company: "GrowthCo",
    avatar: "from-orange-400 to-red-400",
    rating: 5.0,
    review:
      "The analytics dashboard gives us insights we never had before. We can now track every interaction and optimize our approach in real-time.",
    category: "Customer Support",
  },
  {
    id: 5,
    name: "Lisa Wang",
    role: "Head of Sales",
    company: "ScaleVentures",
    avatar: "from-indigo-400 to-purple-400",
    rating: 4.9,
    review:
      "Integration with our existing CRM was seamless. The automated follow-ups have doubled our lead engagement rate.",
    category: "Sales",
  },
  {
    id: 6,
    name: "James Mitchell",
    role: "Digital Marketing Manager",
    company: "BrandBoost",
    avatar: "from-pink-400 to-rose-400",
    rating: 4.8,
    review:
      "The campaign scheduling and audience segmentation tools are incredibly powerful. ROI has improved by over 60% since we started.",
    category: "Marketing",
  },
];

export default function CustomerReviews() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [direction, setDirection] = useState<"next" | "prev">("next");

  const cardsPerView = 3;
  const totalSlides = reviews.length - cardsPerView + 1;

  useEffect(() => {
    if (!isAutoPlaying) return;

    const interval = setInterval(() => {
      handleNext();
    }, 5000);

    return () => clearInterval(interval);
  }, [currentIndex, isAutoPlaying]);

  const handleNext = () => {
    setDirection("next");
    setCurrentIndex((prev) => (prev + 1) % totalSlides);
  };

  const handlePrev = () => {
    setDirection("prev");
    setCurrentIndex((prev) => (prev - 1 + totalSlides) % totalSlides);
  };

  const handleDotClick = (index: number) => {
    setDirection(index > currentIndex ? "next" : "prev");
    setCurrentIndex(index);
    setIsAutoPlaying(false);
  };

  const visibleReviews = reviews.slice(
    currentIndex,
    currentIndex + cardsPerView
  );

  return (
    <section id="customer-reviews" className="reviews-section">
      <div className="reviews-container">
        {/* Section Header */}
        <div className="reviews-header">
          <h2 className="reviews-title">
            Loved by support, sales, and marketing teams
          </h2>
          <p className="reviews-subtitle">
            Join thousands of teams who are transforming their customer
            engagement with Flowauxi
          </p>
        </div>

        {/* Carousel Container */}
        <div className="carousel-wrapper">
          {/* Navigation Buttons */}
          <button
            onClick={handlePrev}
            className="carousel-nav carousel-nav-prev"
            aria-label="Previous reviews"
            onMouseEnter={() => setIsAutoPlaying(false)}
            onMouseLeave={() => setIsAutoPlaying(true)}
          >
            <svg
              className="nav-icon"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>

          {/* Cards Container */}
          <div className="carousel-track">
            {visibleReviews.map((review, idx) => (
              <div
                key={review.id}
                className={`review-card card-${idx} ${direction}`}
                style={{
                  animationDelay: `${idx * 0.1}s`,
                }}
              >
                {/* Card Header */}
                <div className="review-card-header">
                  <div className="reviewer-info">
                    <div
                      className={`reviewer-avatar bg-gradient-to-br ${review.avatar}`}
                    >
                      <span className="avatar-initial">
                        {review.name.charAt(0)}
                      </span>
                    </div>
                    <div className="reviewer-details">
                      <p className="reviewer-name">{review.name}</p>
                      <p className="reviewer-role">
                        {review.role}, {review.company}
                      </p>
                    </div>
                  </div>
                  <div className="review-rating">
                    <svg
                      className="star-icon"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span className="rating-value">{review.rating}</span>
                  </div>
                </div>

                {/* Review Content */}
                <p className="review-text">"{review.review}"</p>

                {/* Category Badge */}
                <div className="review-footer">
                  <span
                    className={`category-badge ${
                      review.category === "Sales"
                        ? "badge-sales"
                        : review.category === "Marketing"
                        ? "badge-marketing"
                        : "badge-support"
                    }`}
                  >
                    {review.category}
                  </span>
                </div>

                {/* Decorative Quote Mark */}
                <div className="quote-decoration">
                  <svg
                    className="quote-icon"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                  </svg>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleNext}
            className="carousel-nav carousel-nav-next"
            aria-label="Next reviews"
            onMouseEnter={() => setIsAutoPlaying(false)}
            onMouseLeave={() => setIsAutoPlaying(true)}
          >
            <svg
              className="nav-icon"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>

        {/* Carousel Indicators */}
        <div className="carousel-indicators">
          {Array.from({ length: totalSlides }).map((_, idx) => (
            <button
              key={idx}
              onClick={() => handleDotClick(idx)}
              className={`indicator-dot ${
                currentIndex === idx ? "indicator-active" : ""
              }`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>

        {/* Stats Section */}
        <div className="reviews-stats">
          <div className="stat-item">
            <div className="stat-value">4.9</div>
            <div className="stat-label">Average Rating</div>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item">
            <div className="stat-value">10,000+</div>
            <div className="stat-label">Happy Customers</div>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item">
            <div className="stat-value">98%</div>
            <div className="stat-label">Satisfaction Rate</div>
          </div>
        </div>
      </div>
    </section>
  );
}
