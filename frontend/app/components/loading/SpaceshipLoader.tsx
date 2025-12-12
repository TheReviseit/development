import React from "react";
import "./SpaceshipLoader.css";

interface SpaceshipLoaderProps {
  text?: string;
}

export default function SpaceshipLoader({
  text = "Loading",
}: SpaceshipLoaderProps) {
  return (
    <div className="spaceship-loading-container">
      <div className="spaceship-body">
        <span>
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </span>
        <div className="spaceship-base">
          <span></span>
          <div className="spaceship-face"></div>
        </div>
      </div>
      <div className="spaceship-longfazers">
        <span></span>
        <span></span>
        <span></span>
        <span></span>
      </div>
      <h1 className="spaceship-text">{text}</h1>
    </div>
  );
}
