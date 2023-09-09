function Quadtree(bounds, max_objects, max_levels, level) {

	this.max_objects = max_objects || 10;
	this.max_levels	= max_levels || 4;

	this.level = level || 0;
	this.bounds = bounds;

	this.objects = [];
	this.nodes = [];

};

Quadtree.prototype.split = function() {

	var nextLevel	= this.level + 1,
		subWidth = Math.round(this.bounds.width*0.5),
		subHeight = Math.round(this.bounds.height*0.5),
		x = Math.round(this.bounds.x),
		y = Math.round(this.bounds.y);

 	//top right node
	this.nodes[0] = new Quadtree({
		x: x + subWidth,
		y: y,
		width: subWidth,
		height: subHeight
	}, this.max_objects, this.max_levels, nextLevel);

	//top left node
	this.nodes[1] = new Quadtree({
		x: x,
		y: y,
		width: subWidth,
		height: subHeight
	}, this.max_objects, this.max_levels, nextLevel);

	//bottom left node
	this.nodes[2] = new Quadtree({
		x: x,
		y: y + subHeight,
		width: subWidth,
		height: subHeight
	}, this.max_objects, this.max_levels, nextLevel);

	//bottom right node
	this.nodes[3] = new Quadtree({
		x: x + subWidth,
		y: y + subHeight,
		width: subWidth,
		height: subHeight
	}, this.max_objects, this.max_levels, nextLevel);
};

Quadtree.prototype.getIndex = function(pRect) {

	var index = -1,
		verticalMidpoint = this.bounds.x + (this.bounds.width*0.5),
		horizontalMidpoint = this.bounds.y + (this.bounds.height*0.5),

		//pRect can completely fit within the top quadrants
		topQuadrant = (pRect.y < horizontalMidpoint && pRect.y + pRect.height < horizontalMidpoint),

		//pRect can completely fit within the bottom quadrants
		bottomQuadrant = (pRect.y > horizontalMidpoint);

	//pRect can completely fit within the left quadrants
	if (pRect.x < verticalMidpoint && pRect.x + pRect.width < verticalMidpoint) {
		if (topQuadrant) {
			index = 1;
		} else if(bottomQuadrant) {
			index = 2;
		}

	//pRect can completely fit within the right quadrants
	} else if (pRect.x > verticalMidpoint) {
		if(topQuadrant) {
			index = 0;
		} else if (bottomQuadrant) {
			index = 3;
		}
	}

	return index;
};

Quadtree.prototype.insert = function(pRect) {

	var i = 0,
 		index;

 	//if we have subnodes ...
	if (typeof this.nodes[0] !== 'undefined') {
		index = this.getIndex(pRect);

	  	if (index !== -1) {
			this.nodes[index].insert(pRect);
		 	return;
		}
	}

 	this.objects.push(pRect);

	if (this.objects.length > this.max_objects && this.level < this.max_levels) {

		//split if we don't already have subnodes
		if (typeof this.nodes[0] === 'undefined') {
			this.split();
		}

		//add all objects to there corresponding subnodes
		while (i < this.objects.length) {

			index = this.getIndex(this.objects[i]);

			if (index !== -1) {
				this.nodes[index].insert(this.objects.splice(i, 1)[0]);
			} else {
				i = i + 1;
		 	}
	 	}
	}
 };

Quadtree.prototype.retrieve = function(pRect) {

	var 	index = this.getIndex(pRect),
		returnObjects = this.objects;

	//if we have subnodes ...
	if (typeof this.nodes[0] !== 'undefined') {

		//if pRect fits into a subnode ..
		if (index !== -1) {
			returnObjects = returnObjects.concat(this.nodes[index].retrieve(pRect));
		} else { //if pRect does not fit into a subnode, check it against all subnodes
			for (var i=0; i < this.nodes.length; i=i+1) {
				returnObjects = returnObjects.concat(this.nodes[i].retrieve(pRect));
			}
		}
	}

	return returnObjects;
};

Quadtree.prototype.clear = function() {

	this.objects = [];

	for (var i=0; i < this.nodes.length; i=i+1) {
		if (typeof this.nodes[i] !== 'undefined') {
      this.nodes[i].clear();
	  }
	}

	this.nodes = [];
};

module.exports = Quadtree;
