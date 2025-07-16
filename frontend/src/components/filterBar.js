import React from 'react';
import './filterBar.css';

const FilterBar = ({ filters, onChange, onSearch, onReset }) => {
  return (
    <div className="filter-bar">
      <h3>Filters</h3>
      <input
        type="text"
        name="supervisor"
        placeholder="Supervisor"
        value={filters.supervisor}
        onChange={onChange}
      />
      <input
        type="text"
        name="topic"
        placeholder="Topic"
        value={filters.topic}
        onChange={onChange}
      />
      <input
        type="text"
        name="keyword"
        placeholder="Keyword"
        value={filters.keyword}
        onChange={onChange}
      />
      <button onClick={onSearch}>Search</button>
      <button className="reset-btn" onClick={onReset}>Reset Filter</button>
    </div>
  );
};

export default FilterBar;
