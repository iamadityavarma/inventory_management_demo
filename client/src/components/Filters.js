import React, { useRef, useEffect, useState } from 'react';
import Select from 'react-select';

// React-Select dropdown with scroll lock
const CustomDropdown = ({ options, value, onChange, placeholder, disabled, className, allowEmpty = false }) => {
  // For entities with only one branch, we should avoid showing redundant "All X Branches" options
  const menuItems = [...options];

  // Find the selected option object
  const selectedOption = menuItems.find(option => option.value === value);
  
  // Format the components for React-Select
  const formatOptionLabel = ({ value, label }) => {
    // If label is already a React element (JSX), return it as is
    return label;
  };
  
  // Track scroll position
  const scrollPosition = useRef(0);
  
  // Disable body scroll
  const disableBodyScroll = () => {
    // Store current scroll position
    scrollPosition.current = window.scrollY;
    
    // Calculate scrollbar width
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    
    // Apply styles to body
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollPosition.current}px`;
    document.body.style.width = '100%';
    document.body.style.paddingRight = `${scrollbarWidth}px`;
  };
  
  // Enable body scroll
  const enableBodyScroll = () => {
    // Remove styles from body
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    document.body.style.paddingRight = '';
    
    // Restore scroll position
    window.scrollTo(0, scrollPosition.current);
  };
  
  // Custom styles for React-Select
  const customStyles = {
    control: (provided, state) => ({
      ...provided,
      minHeight: '44px',
      height: 'auto', // Allow height to adjust for multi-line content
      borderRadius: '0.75rem',
      borderColor: state.isFocused ? '#818cf8' : '#e5e7eb',
      boxShadow: state.isFocused ? '0 0 0 2px #c7d2fe' : 'none',
      '&:hover': {
        borderColor: '#d1d5db',
      },
      backgroundColor: disabled ? '#f3f4f6' : 'white',
      cursor: disabled ? 'not-allowed' : 'pointer',
      padding: '0 0.5rem'
    }),
    valueContainer: (provided) => ({
      ...provided,
      minHeight: '44px',
      height: 'auto', // Allow height to adjust for multi-line content
      padding: '0.5rem',
      display: 'flex',
      alignItems: 'center',
    }),
    indicatorSeparator: () => ({
      display: 'none',
    }),
    dropdownIndicator: (provided) => ({
      ...provided,
      color: '#6b7280',
    }),
    menu: (provided) => ({
      ...provided,
      borderRadius: '0.75rem',
      overflow: 'hidden',
      zIndex: 9999999,
    }),
    menuList: (provided) => ({
      ...provided,
      padding: '4px 0',
      // Custom modern scrollbar
      scrollbarWidth: 'thin',
      scrollbarColor: 'rgba(203, 213, 225, 0.4) transparent',
      '&::-webkit-scrollbar': {
        width: '4px',
        height: '4px',
      },
      '&::-webkit-scrollbar-track': {
        background: 'transparent',
      },
      '&::-webkit-scrollbar-thumb': {
        background: 'rgba(203, 213, 225, 0.4)',
        borderRadius: '999px',
      },
      '&::-webkit-scrollbar-thumb:hover': {
        background: 'rgba(148, 163, 184, 0.6)',
      },
    }),
    option: (provided, state) => ({
      ...provided,
      backgroundColor: state.isSelected ? '#eff6ff' : state.isFocused ? '#eff6ff' : 'white',
      color: state.isSelected ? '#1d4ed8' : '#1f2937',
      fontWeight: state.isSelected ? '500' : '400',
      cursor: 'pointer',
      padding: '10px 16px',
      ':hover': {
        backgroundColor: '#eff6ff',
      },
    }),
    placeholder: (provided) => ({
      ...provided,
      color: '#6b7280',
    }),
    singleValue: (provided) => ({
      ...provided,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      color: '#1f2937',
    }),
  };

  return (
    <div className={className || ''}>
      <Select
        value={selectedOption}
        onChange={(option) => {
          onChange(option ? option.value : '');
        }}
        options={menuItems}
        placeholder={placeholder}
        isDisabled={disabled}
        isClearable={false}
        styles={customStyles}
        menuPortalTarget={document.body}
        menuPosition="fixed"
        menuPlacement="auto"
        classNamePrefix="zentroq-select"
        isSearchable={false}
        maxMenuHeight={220}
        components={{
          IndicatorSeparator: () => null
        }}
        formatOptionLabel={formatOptionLabel}
        closeMenuOnScroll={false}
        onMenuOpen={disableBodyScroll}
        onMenuClose={enableBodyScroll}
      />
    </div>
  );
};

const Filters = ({ filters, onFilterChange, entities, availableBranches, onSearchSubmit }) => {
  const [inputValue, setInputValue] = useState(filters.searchQuery || '');

  useEffect(() => {
    // Sync inputValue with filters.searchQuery from props,
    // but only if they are different to prevent potential loops
    // if onSearchSubmit immediately updates filters.searchQuery to the same value.
    if (filters.searchQuery !== inputValue) {
      setInputValue(filters.searchQuery || '');
    }
  }, [filters.searchQuery]); // Removed inputValue from dependency array as per best practice for this pattern

  // Create a flat list of all branches with their entities
  const allBranchOptions = [];
  
  // Add "All Branches (All Entities)" option at the top
  allBranchOptions.push({
    value: '|', // Empty entity and branch indicates all entities and branches
    label: 'All Branches',
    isGlobalOption: true
  });
  
  // Add "All Entity Branches" options for each entity that has more than one branch
  entities.forEach(entity => {
    const branches = availableBranches[entity] || [];
    // Only add "All X Branches" option if there's more than one branch
    if (branches.length > 1) {
      allBranchOptions.push({
        value: `${entity}|`, // Empty branch indicates all branches for this entity
        label: `All ${entity} Branches`,
        entity: entity,
        isAllBranchesOption: true
      });
    }
  });
  
  // Then add individual branch options
  entities.forEach(entity => {
    const branches = availableBranches[entity] || [];
    branches.forEach(branch => {
      allBranchOptions.push({
        value: `${entity}|${branch}`, // Store both entity and branch in the value
        label: branch,
        entity: entity
      });
    });
  });
  
  // No need for the modal state and handlers, they'll be moved to App.js

  return (
    <div className={filters.advancedFiltersActive ? 'advanced-filters-active' : ''}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-gray-900 text-sm font-bold tracking-widest uppercase">FILTERS & SEARCH</h2>
        
        {filters.advancedFiltersActive && (
          <div className="flex items-center">
            <span className="text-xs text-indigo-600 font-medium">Advanced Filters Applied</span>
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {/* Branch Filter with Entity Indicator */}
        <div className="md:col-span-1 flex items-end space-x-2">
          <div className="flex-grow">
            <div className="flex items-center">
              <label className="block text-gray-500 text-xs font-medium tracking-widest uppercase mb-1">BRANCH</label>
            </div>
            <CustomDropdown
              className="filter-field"
              options={allBranchOptions.map(option => ({
              value: option.value,
              label: option.isGlobalOption ? (
                <div className="font-medium text-purple-700 border-b border-purple-200 pb-1 mb-1">
                  <div className="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm11 1H6v8l4-2 4 2V6z" clipRule="evenodd" />
                    </svg>
                    {option.label}
                  </div>
                </div>
              ) : option.isAllBranchesOption ? (
                <div className="font-medium text-indigo-600">
                  {option.label}
                </div>
              ) : (
                <div className="flex flex-col">
                  <span>{option.label}</span>
                  <span className="text-xs text-gray-500">{option.entity}</span>
                </div>
              )
            }))}
            value={
              filters.entity ? (filters.branch ? `${filters.entity}|${filters.branch}` : `${filters.entity}|`) : 
              '|' // Default to "All Branches" (empty entity and branch)
            }
            onChange={(value) => {
              if (value) {
                const [entity, branch] = value.split('|');
                
                // Check if it's the "All Branches" global option
                if (entity === '') {
                  // For All Branches, leave entity empty
                  // App.js will handle this special case
                  onFilterChange('entity', '');
                  onFilterChange('branch', '');
                } else {
                  // Update entity and branch
                  onFilterChange('entity', entity);
                  onFilterChange('branch', branch);
                }
              } else {
                // Clear both
                onFilterChange('entity', '');
                onFilterChange('branch', '');
              }
            }}
            placeholder="All Branches"
            allowEmpty={false}
            />
          </div>
          
          {/* <button 
            type="button" 
            onClick={() => onShowAdvancedFilters()}
            className="h-11 w-11 flex items-center justify-center text-gray-500 hover:text-indigo-600 bg-white border border-gray-200 rounded-xl hover:border-indigo-300 transition-colors advanced-filter-control"
            title="Advanced Filters"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </button> */}
        </div>
        
        {/* Search Field */}
        <div className="md:col-span-2 lg:col-span-3">
          <label className="block text-gray-500 text-xs font-medium tracking-widest uppercase mb-1">SEARCH</label>
          <div className="flex items-center space-x-2" style={{ zIndex: 1 }}>
            <div className="relative flex-grow">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none" style={{ zIndex: 2 }}>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path fillRule="evenodd" clipRule="evenodd" d="M8 4C5.79086 4 4 5.79086 4 8C4 10.2091 5.79086 12 8 12C10.2091 12 12 10.2091 12 8C12 5.79086 10.2091 4 8 4ZM2 8C2 4.68629 4.68629 2 8 2C11.3137 2 14 4.68629 14 8C14 9.29583 13.5892 10.4957 12.8907 11.4765L17.7071 16.2929C18.0976 16.6834 18.0976 17.3166 17.7071 17.7071C17.3166 18.0976 16.6834 18.0976 16.2929 17.7071L11.4765 12.8907C10.4957 13.5892 9.29583 14 8 14C4.68629 14 2 11.3137 2 8Z" fill="#555555"/>
                </svg>
              </div>
              <input
                type="text"
                className="appearance-none block w-full pl-10 pr-4 py-3 text-gray-800 \
                           bg-white border border-gray-200 rounded-xl shadow-none \
                           focus:ring-2 focus:ring-indigo-400 focus:outline-none focus:border-transparent sm:text-sm \
                           transition-all duration-200 hover:border-gray-300\
                           filter-field"
                style={{ position: 'relative', zIndex: 1 }}
                placeholder="Search by part number or description"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    // Pass the current input value to the submit handler
                    onSearchSubmit && onSearchSubmit(inputValue);
                  }
                }}
              />
            </div>
            <button
              type="button"
              // Pass the current input value to the submit handler
              onClick={() => onSearchSubmit && onSearchSubmit(inputValue)}
              className="h-11 px-4 flex items-center justify-center text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all duration-150 glass-button"
              title="Submit Search"
              style={{
                backgroundColor: 'rgba(79, 70, 229, 0.7)', // Indigo with opacity
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.08)'
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
              <span className="ml-2">Search</span>
            </button>
          </div>
        </div>
      </div>
      
      {/* The Advanced Filters Modal is now in App.js */}
      
      {/* Advanced Filters Badge */}
      {filters.advancedFiltersActive && (
        <div className="mt-4 bg-indigo-50 border border-indigo-100 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-medium text-indigo-800">Advanced Filters Active</span>
            </div>
            {/* <button
              type="button"
              onClick={() => onShowAdvancedFilters()}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center cursor-pointer advanced-filter-control"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit Filters
            </button> */}
          </div>
          
          <div className="mt-2 text-xs text-gray-600">
            <p>
              <span className="font-medium">Selected Entities:</span> {' '}
              {filters.advancedFilters?.selectedEntities?.length 
                ? filters.advancedFilters.selectedEntities.join(', ') 
                : 'None'}
            </p>
            <p className="mt-1">
              <span className="font-medium">Branches:</span> {' '}
              {filters.advancedFilters?.showAllBranches 
                ? 'All Branches' 
                : Object.entries(filters.advancedFilters?.selectedBranches || {})
                    .map(([entity, branches]) => 
                      `${entity} (${branches.length === availableBranches[entity]?.length 
                        ? 'All' 
                        : branches.length} branches)`
                    )
                    .join(', ') || 'None'
              }
            </p>
            
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  onFilterChange('advancedFiltersActive', false);
                  onFilterChange('advancedFilters', {});
                }}
                className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-medium rounded-md flex items-center cursor-pointer advanced-filter-control"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Reset Advanced Filters
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Active Filters Display */}
      {(filters.entity || filters.searchQuery || (!filters.entity && !filters.advancedFiltersActive)) && (
        <div className="flex flex-wrap gap-2 mt-4">
          {filters.entity ? (
            <span className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-medium bg-white/80 backdrop-blur-sm text-gray-800 shadow-sm border-0 transition-all duration-200 hover:shadow-md">
              <span className="text-gray-900 font-bold">Entity:&nbsp;</span> {filters.entity}
              {filters.branch ? (
                <span className="ml-1">
                  <span className="text-gray-600"> / </span>
                  <span className="text-gray-900 font-bold">Branch:&nbsp;</span> {filters.branch}
                </span>
              ) : (
                <span className="ml-1 text-gray-600">(All Branches)</span>
              )}
              <button
                type="button"
                className="ml-2 inline-flex text-gray-500 hover:text-gray-700 focus:outline-none transition-colors"
                onClick={() => {
                  onFilterChange('entity', 'ALL_ENTITIES');
                  onFilterChange('branch', '');
                }}
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </span>
          ) : !filters.entity && !filters.advancedFiltersActive && (
            <span className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-medium bg-white/80 backdrop-blur-sm text-gray-800 shadow-sm border-0 transition-all duration-200 hover:shadow-md">
              <span className="text-gray-900 font-bold">Branch:&nbsp;</span>
              <span className="text-purple-700 font-medium">All Branches</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1 text-purple-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm11 1H6v8l4-2 4 2V6z" clipRule="evenodd" />
              </svg>
              <span className="ml-1 text-gray-600 text-xs">(All Entities)</span>
            </span>
          )}
          
          {/* Always display search query if it exists, regardless of advanced filters state */}
          {filters.searchQuery && (
            <span className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-medium bg-white/80 backdrop-blur-sm text-gray-800 shadow-sm border-0 transition-all duration-200 hover:shadow-md">
              <span className="text-gray-900 font-bold">Search:&nbsp;</span> {filters.searchQuery}
              <button
                type="button"
                className="ml-2 inline-flex text-gray-500 hover:text-gray-700 focus:outline-none transition-colors"
                onClick={() => onFilterChange('searchQuery', '')}
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </span>
          )}
          
          <button
            type="button"
            className="inline-flex items-center px-4 py-2 shadow-sm text-sm font-medium rounded-xl text-gray-700 
                     bg-white/80 backdrop-blur-sm border-0 transition-all duration-200 hover:shadow-md
                     focus:outline-none focus:ring-2 focus:ring-indigo-400"
            onClick={() => {
              // When clearing, we need to clear both entity and branch together
              onFilterChange('entity', '');
              onFilterChange('branch', '');
              onFilterChange('searchQuery', '');
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear All
          </button>
        </div>
      )}
    </div>
  );
};

// The AdvancedFiltersModal component has been moved to a separate file

export default Filters;