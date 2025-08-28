import React from 'react';

const FilterBar = ({ filters, onChange, onSearch, onReset }) => {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSearch();
    }
  };

  return (
    <aside className="filters-panel">
      <h4>Filters</h4>

      <div className="field">
        <label>Supervisor</label>
        <input
          type="text"
          name="supervisor"
          placeholder="Supervisor"
          value={filters.supervisor}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
      </div>

      <div className="field">
        <label>Topic</label>
        <input
          type="text"
          name="topic"
          placeholder="Topic"
          value={filters.topic}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
      </div>

      <div className="field">
        <label>Keyword</label>
        <input
          type="text"
          name="keyword"
          placeholder="Keyword"
          value={filters.keyword}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
      </div>

      <div className="actions">
        <button type="button" className="btn search-btn" onClick={onSearch}>
          Search
        </button>
        <button type="button" className="btn reset-btn" onClick={onReset}>
          Reset Filter
        </button>
      </div>
    </aside>
  );
};

export default FilterBar;
