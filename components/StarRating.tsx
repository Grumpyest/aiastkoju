import React from 'react';

interface StarRatingProps {
  rating: number;
  max?: number;
  interactive?: boolean;
  onRate?: (rating: number) => void;
  className?: string;
  sizeClass?: string;
  activeClass?: string;
  inactiveClass?: string;
}

const StarRating: React.FC<StarRatingProps> = ({
  rating,
  max = 5,
  interactive = false,
  onRate,
  className = "flex items-center gap-0.5",
  sizeClass = "text-[10px]",
  activeClass = "text-yellow-400",
  inactiveClass = "text-stone-100"
}) => {
  return (
    <div className={className}>
      {Array.from({ length: max }, (_, i) => i + 1).map(star => {
        const isActive = star <= rating;
        const iconClass = `fa-solid fa-star ${sizeClass} ${isActive ? activeClass : inactiveClass}`;
        
        if (interactive) {
          return (
            <button key={star} type="button" onClick={() => onRate?.(star)} className="transition-transform hover:scale-110 leading-none">
              <i className={iconClass}></i>
            </button>
          );
        }
        
        return <i key={star} className={iconClass}></i>;
      })}
    </div>
  );
};

export default StarRating;